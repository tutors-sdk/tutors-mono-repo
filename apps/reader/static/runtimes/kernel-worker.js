/**
 * The engines.
 *
 * Runs inside a worker owned by runtime-host.html, on that frame's opaque origin. Speaks
 * the protocol in `@tutors/runtime`: one `execute` message in, a stream of events out,
 * then exactly one `done`. It is plain JavaScript served as a static file rather than
 * bundled, because the sandbox fetches it as text and starts it from a blob — a worker
 * cannot be loaded by URL from an opaque origin.
 *
 * Three modes matter. `script` runs a program in a clean namespace, `cell` runs a notebook
 * cell in the namespace every earlier cell shared, and `test` runs the exercise's checks.
 */

/* eslint-disable */

let baseUrl = "";
let configPromise = null;

let python = null;
let pythonNamespace = null;
let typescriptLoaded = false;
let currentId = "";

function post(event) {
  self.postMessage(event);
}

function status(phase, detail) {
  post({ type: "status", id: currentId, phase: phase, detail: detail });
}

function stream(text, which) {
  if (!text) return;
  post({ type: "stream", id: currentId, stream: which || "stdout", text: text });
}

/**
 * Run a CommonJS bundle in this worker and hand back what it exported.
 *
 * The TypeScript compiler ships as a CommonJS bundle, and `importScripts` cannot reach it:
 * a cross-origin script is refused on an opaque origin, which is where this worker lives.
 * `fetch` is not (the assets carry `Access-Control-Allow-Origin`), so fetch the text and
 * call it with a module object, which is what its own loader would have done.
 */
async function loadCommonJs(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download " + url + " (" + response.status + ")");
  const source = await response.text();
  const module = { exports: {} };
  new Function("module", "exports", "require", source)(module, module.exports, function () {
    throw new Error("This bundle asked for a module the run-time does not have.");
  });
  return module.exports;
}

function config() {
  if (!configPromise) {
    configPromise = fetch(baseUrl + "config.json")
      .then(function (response) {
        if (!response.ok) throw new Error("missing");
        return response.json();
      })
      .catch(function () {
        // The sync script has not run. Fall back to the conventional layout so a checkout
        // that only forgot one build step still says something useful when it fails.
        return { pyodide: { path: "pyodide/" }, typescript: { path: "typescript/" }, pythonPackageIndex: "" };
      });
  }
  return configPromise;
}

/* ------------------------------------------------------------------ Python */

async function pythonEngine(packages) {
  if (python) return python;

  const settings = await config();
  status("booting", "Downloading Python…");

  // Packages beyond the standard library are not part of the self-hosted copy — that copy
  // is the core run-time only, a few megabytes rather than a few hundred. A playground
  // that asks for packages is served from the configured index instead, where the wheels
  // and the lock file live together.
  const wantsPackages = Array.isArray(packages) && packages.length > 0;
  const index = wantsPackages && settings.pythonPackageIndex ? settings.pythonPackageIndex : new URL(settings.pyodide.path, baseUrl).href;

  // Pyodide declines to start in a classic worker, and a classic worker is the only kind an
  // opaque origin can have: a module worker's script is fetched with CORS, which a blob URL
  // minted in a sandbox cannot satisfy. What it actually tests for is whether
  // `importScripts` works, so take that away — nothing here uses it, the engines are loaded
  // by `import()` and by `new Function` instead.
  Object.defineProperty(self, "importScripts", { value: undefined, configurable: true });

  // Fetched by URL rather than imported by name: this worker was started from a blob, so a
  // bare specifier has nothing to resolve against.
  const pyodide = await import(/* @vite-ignore */ index + "pyodide.mjs");
  python = await pyodide.loadPyodide({ indexURL: index });

  python.FS.mkdirTree("/workspace");
  python.runPython("import sys, os\nos.chdir('/workspace')\nsys.path.insert(0, '/workspace')");

  if (wantsPackages) {
    status("installing", "Installing " + packages.join(", ") + "…");
    await python.loadPackage(packages, { messageCallback: function () {} });
  }
  return python;
}

function writePythonFiles(engine, files) {
  files.forEach(function (file) {
    const path = "/workspace/" + file.path;
    const parent = path.slice(0, path.lastIndexOf("/"));
    if (parent && parent !== "/workspace") engine.FS.mkdirTree(parent);
    engine.FS.writeFile(path, file.content);
  });
}

function bindPythonOutput(engine) {
  engine.setStdout({ batched: function (text) { stream(text + "\n", "stdout"); } });
  engine.setStderr({ batched: function (text) { stream(text + "\n", "stderr"); } });
}

/**
 * Strip the harness out of a traceback.
 *
 * Tutors runs the student's file through `runpy`, so a raw traceback opens with frames
 * from this file and from runpy itself. A student reading an error should see their own
 * code and nothing else.
 */
function cleanPythonError(message) {
  const lines = String(message).split("\n");
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHarness = line.indexOf('File "<exec>"') >= 0 || line.indexOf("/lib/python") >= 0 || line.indexOf("in run_path") >= 0 || line.indexOf("in _run_module_code") >= 0 || line.indexOf("in _run_code") >= 0;
    if (isHarness) {
      // A traceback frame is two lines: the location and the source line under it.
      if (i + 1 < lines.length && /^\s{4}\S/.test(lines[i + 1])) i++;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function runPython(request) {
  const engine = await pythonEngine(request.packages);
  bindPythonOutput(engine);

  if (request.mode === "cell") {
    if (!pythonNamespace) {
      pythonNamespace = engine.globals.get("dict")();
      pythonNamespace.set("__name__", "__main__");
    }
    const source = request.files.length > 0 ? request.files[0].content : "";
    const value = await engine.runPythonAsync(source, { globals: pythonNamespace });
    return { value: describePythonValue(value) };
  }

  writePythonFiles(engine, request.files);

  if (request.mode === "test") {
    const testFile = request.files[request.files.length - 1];
    const passed = await engine.runPythonAsync(pythonTestHarness(testFile.path));
    return { ok: passed === true, value: "" };
  }

  const entry = JSON.stringify("/workspace/" + request.entry);
  await engine.runPythonAsync("import runpy\nrunpy.run_path(" + entry + ', run_name="__main__")');
  return { value: "" };
}

function describePythonValue(value) {
  if (value === undefined || value === null) return "";
  try {
    const text = value.toString();
    if (typeof value.destroy === "function") value.destroy();
    return text;
  } catch {
    return "";
  }
}

/**
 * Run the exercise's checks.
 *
 * `unittest` is used when the file contains test cases, because it reports each one; a
 * file of bare asserts is simply executed, because that is a perfectly good first exercise
 * and refusing to run it would be pedantic.
 */
function pythonTestHarness(path) {
  return [
    "import sys, unittest, runpy",
    "def _tutors_tests(path):",
    "    loader = unittest.TestLoader()",
    "    suite = loader.discover('/workspace', pattern=path)",
    "    if suite.countTestCases() == 0:",
    "        try:",
    "            runpy.run_path('/workspace/' + path, run_name='__main__')",
    "        except AssertionError as error:",
    "            print('FAILED: ' + (str(error) or 'assertion failed'), file=sys.stderr)",
    "            return False",
    "        print('All checks passed.')",
    "        return True",
    "    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite)",
    "    return result.wasSuccessful()",
    "_tutors_tests(" + JSON.stringify(path) + ")"
  ].join("\n");
}

/* ------------------------------------------- JavaScript and TypeScript */

function formatConsoleArgument(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value, replaceCircular(), 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function replaceCircular() {
  const seen = new WeakSet();
  return function (_key, value) {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    if (typeof value === "function") return "[Function " + (value.name || "anonymous") + "]";
    return value;
  };
}

function installConsole() {
  const write = function (which) {
    return function () {
      const parts = [];
      for (let i = 0; i < arguments.length; i++) parts.push(formatConsoleArgument(arguments[i]));
      stream(parts.join(" ") + "\n", which);
    };
  };
  self.console.log = write("stdout");
  self.console.info = write("stdout");
  self.console.debug = write("stdout");
  self.console.warn = write("stderr");
  self.console.error = write("stderr");
}

installConsole();

/** Which workspace file a specifier refers to, allowing the extension to be left off. */
function resolveSpecifier(specifier, byPath) {
  const candidates = [specifier, specifier + ".js", specifier + ".mjs", specifier + ".ts", specifier + ".json"];
  for (const candidate of candidates) {
    const normalised = candidate.replace(/^\.\//, "");
    if (byPath.has(normalised)) return normalised;
  }
  return null;
}

const SPECIFIER_PATTERN = /(\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)(["'])([^"']+)\2/g;

function rewriteSpecifiers(source, byPath, urls) {
  return source.replace(SPECIFIER_PATTERN, function (match, keyword, quote, specifier) {
    if (!specifier.startsWith(".")) return match;
    const target = resolveSpecifier(specifier, byPath);
    if (!target || !urls.has(target)) return match;
    return keyword + quote + urls.get(target) + quote;
  });
}

function dependenciesOf(source, byPath) {
  const found = [];
  let match;
  SPECIFIER_PATTERN.lastIndex = 0;
  while ((match = SPECIFIER_PATTERN.exec(source)) !== null) {
    if (!match[3].startsWith(".")) continue;
    const target = resolveSpecifier(match[3], byPath);
    if (target) found.push(target);
  }
  return found;
}

function asModule(path) {
  return /\.(js|mjs|cjs|ts|tsx|jsx)$/.test(path);
}

/**
 * Make a data file importable.
 *
 * A workspace carries `.json`, `.csv` and `.txt` alongside its code, and Python can simply
 * open them. JavaScript has no file system here, so each becomes a module with the data as
 * its default export — `import rows from "./data.json"`, which is what a student would
 * write anywhere else.
 */
function asData(path, source) {
  if (/\.json$/.test(path)) {
    try {
      return "export default " + JSON.stringify(JSON.parse(source)) + ";";
    } catch (error) {
      return "throw new Error(" + JSON.stringify(path + " is not valid JSON: " + error.message) + ");";
    }
  }
  return "export default " + JSON.stringify(source) + ";";
}

/**
 * Turn a set of files into importable modules.
 *
 * Each file becomes a blob, and a file's imports are rewritten to the blob URLs of the
 * files they name — so a module has to be built after everything it imports. That ordering
 * is what the walk below produces, and it is also why a cycle cannot be supported: neither
 * of two mutually importing files can be built first.
 */
function buildModules(files) {
  const byPath = new Map(files.map(function (file) { return [file.path, file.content]; }));
  const urls = new Map();
  const building = new Set();

  const build = function (path) {
    if (urls.has(path)) return urls.get(path);
    if (building.has(path)) throw new Error(path + " and its imports form a cycle, which the run-time cannot load.");
    building.add(path);

    const source = byPath.get(path) ?? "";
    dependenciesOf(source, byPath).forEach(build);

    const rewritten = asModule(path) ? rewriteSpecifiers(source, byPath, urls) : asData(path, source);
    const url = URL.createObjectURL(new Blob([rewritten], { type: "text/javascript" }));
    urls.set(path, url);
    building.delete(path);
    return url;
  };

  files.forEach(function (file) { build(file.path); });
  return urls;
}

async function runJavaScript(request, files) {
  if (request.mode === "cell") {
    const source = files.length > 0 ? files[0].content : "";
    // Indirect eval, so declarations land on the worker's global scope and the next cell
    // can see them. That persistence is the whole point of a notebook kernel.
    const value = await (0, eval)(source);
    return { value: value === undefined ? "" : formatConsoleArgument(value) };
  }

  const urls = buildModules(files);
  try {
    if (request.mode === "test") {
      return await runJavaScriptTests(files, urls);
    }
    await import(urls.get(request.entry));
    return { value: "" };
  } finally {
    urls.forEach(function (url) { URL.revokeObjectURL(url); });
  }
}

/**
 * A test file declares checks with `test(name, fn)` and `assert(...)`, which are provided
 * as globals rather than as an import — a beginner should not have to wire up a test
 * framework before writing their first assertion.
 */
async function runJavaScriptTests(files, urls) {
  const results = [];
  self.test = function (name, fn) {
    results.push({ name: name, run: fn });
  };
  self.assert = function (condition, message) {
    if (!condition) throw new Error(message || "assertion failed");
  };
  self.assertEquals = function (actual, expected, message) {
    const same = JSON.stringify(actual) === JSON.stringify(expected);
    if (!same) throw new Error((message ? message + ": " : "") + "expected " + JSON.stringify(expected) + " but got " + JSON.stringify(actual));
  };

  const testFile = files[files.length - 1];
  await import(urls.get(testFile.path));

  let failures = 0;
  for (const entry of results) {
    try {
      await entry.run();
      stream("PASS  " + entry.name + "\n", "stdout");
    } catch (error) {
      failures++;
      stream("FAIL  " + entry.name + " — " + (error && error.message ? error.message : error) + "\n", "stderr");
    }
  }
  if (results.length === 0) stream("No checks were declared. Use test(\"name\", () => { ... }).\n", "stderr");
  else stream("\n" + (results.length - failures) + " of " + results.length + " checks passed.\n", failures ? "stderr" : "stdout");

  return { ok: failures === 0 && results.length > 0, value: "" };
}

/* ------------------------------------------------------------- TypeScript */

async function typescriptCompiler() {
  if (typescriptLoaded) return self.ts;
  const settings = await config();
  status("booting", "Loading the TypeScript compiler…");
  self.ts = await loadCommonJs(new URL(settings.typescript.path, baseUrl).href + "typescript.js");
  typescriptLoaded = true;
  return self.ts;
}

/**
 * Read a compiler library file.
 *
 * Synchronous, because a TypeScript compiler host is a synchronous interface and there is
 * no asynchronous seam to thread a fetch through. Blocking XHR is available in workers and
 * blocks nothing but this worker, which is idle while it waits.
 */
function readLibFile(url) {
  try {
    const request = new XMLHttpRequest();
    request.open("GET", url, false);
    request.send();
    return request.status === 200 ? request.responseText : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The checks harness, as the type checker sees it.
 *
 * `test` and `assert` are handed to a test file as globals, so without this the compiler
 * rejects every test file an author could write and the checks could never run.
 */
const CHECKS_DTS = "tutors-checks.d.ts";
const CHECK_GLOBALS = [
  "declare function test(name: string, run: () => void | Promise<void>): void;",
  "declare function assert(condition: unknown, message?: string): void;",
  "declare function assertEquals(actual: unknown, expected: unknown, message?: string): void;"
].join("\n");

async function compileTypeScript(files, mode) {
  const ts = await typescriptCompiler();
  const settings = await config();
  const libBase = new URL(settings.typescript.path, baseUrl).href + "lib/";

  const options = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    strict: true,
    skipLibCheck: true,
    noEmitOnError: false,
    moduleResolution: ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeJs
  };

  const sources = new Map();
  files.forEach(function (file) {
    sources.set(file.path, ts.createSourceFile(file.path, file.content, options.target, true));
  });
  if (mode === "test") {
    sources.set(CHECKS_DTS, ts.createSourceFile(CHECKS_DTS, CHECK_GLOBALS, options.target, true));
  }

  const emitted = new Map();
  const libCache = new Map();

  const host = {
    getSourceFile: function (fileName) {
      if (sources.has(fileName)) return sources.get(fileName);
      if (libCache.has(fileName)) return libCache.get(fileName);
      const text = readLibFile(libBase + fileName.replace(/^.*\//, ""));
      const file = text === undefined ? undefined : ts.createSourceFile(fileName, text, options.target, true);
      libCache.set(fileName, file);
      return file;
    },
    writeFile: function (fileName, text) {
      emitted.set(fileName, text);
    },
    getDefaultLibFileName: function () {
      return "lib.es2020.full.d.ts";
    },
    useCaseSensitiveFileNames: function () { return true; },
    getCanonicalFileName: function (fileName) { return fileName; },
    getCurrentDirectory: function () { return ""; },
    getNewLine: function () { return "\n"; },
    fileExists: function (fileName) { return sources.has(fileName); },
    readFile: function (fileName) { return sources.has(fileName) ? sources.get(fileName).text : undefined; }
  };

  const program = ts.createProgram(Array.from(sources.keys()), options, host);
  const emitResult = program.emit();

  // Type errors reach the student. Without them TypeScript in a playground is just
  // JavaScript with extra syntax, and the diagnostics are the thing worth learning from.
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics).filter(function (diagnostic) {
    return diagnostic.file && sources.has(diagnostic.file.fileName);
  });

  let errors = 0;
  diagnostics.forEach(function (diagnostic) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    const severity = diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning";
    if (severity === "error") errors++;
    stream(diagnostic.file.fileName + ":" + (position.line + 1) + ":" + (position.character + 1) + " — " + severity + " TS" + diagnostic.code + ": " + message + "\n", severity === "error" ? "stderr" : "stdout");
  });

  if (errors > 0) return null;

  return files.map(function (file) {
    const compiled = emitted.get(file.path.replace(/\.ts$/, ".js"));
    return { path: file.path.replace(/\.ts$/, ".js"), content: compiled ?? file.content };
  });
}

async function runTypeScript(request) {
  if (request.mode === "cell") {
    const ts = await typescriptCompiler();
    const source = request.files.length > 0 ? request.files[0].content : "";
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } });
    return runJavaScript(request, [{ path: "cell.js", content: output.outputText }]);
  }

  const compiled = await compileTypeScript(request.files, request.mode);
  if (compiled === null) {
    return { ok: false, value: "", error: "TypeScript reported errors, so nothing was run." };
  }
  const rewritten = Object.assign({}, request, { entry: request.entry.replace(/\.ts$/, ".js") });
  return runJavaScript(rewritten, compiled);
}

/* ------------------------------------------------------------- Dispatch */

async function execute(request) {
  currentId = request.id;
  const started = Date.now();
  status("running");

  try {
    let outcome;
    if (request.runtime === "python") outcome = await runPython(request);
    else if (request.runtime === "typescript") outcome = await runTypeScript(request);
    else outcome = await runJavaScript(request, request.files);

    if (outcome.error) post({ type: "error", id: request.id, message: outcome.error });
    if (outcome.value) post({ type: "result", id: request.id, value: outcome.value });
    post({ type: "done", id: request.id, ok: outcome.ok !== false, durationMs: Date.now() - started });
  } catch (error) {
    const raw = error && error.message ? error.message : String(error);
    post({ type: "error", id: request.id, message: request.runtime === "python" ? cleanPythonError(raw) : raw });
    post({ type: "done", id: request.id, ok: false, durationMs: Date.now() - started });
  } finally {
    status("idle");
  }
}

self.onmessage = function (event) {
  const message = event.data;
  if (!message) return;
  if (message.type === "configure") {
    baseUrl = message.baseUrl;
    return;
  }
  if (message.type === "execute") {
    void execute(message.request);
  }
};
