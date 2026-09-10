# In-Browser Code Execution (WASM Runtimes)

Running student code in the browser — Python, JavaScript and TypeScript — and letting an
educator see what a student's workspace contains.

Status: **implemented.** Java remains out of scope; see [Java](#java-out-of-scope-for-now).

## Motivation

Notebooks already executed Python. `NotebookCodeEditor.svelte` loaded Pyodide from a CDN
onto the main thread and cached it on `window.__pyodideInstance`. That arrangement had four
defects, and any broader execution capability had to fix all of them regardless:

| Defect | Consequence |
|--------|-------------|
| Pyodide fetched from `cdn.jsdelivr.net` | The reader's CSP (`apps/reader/netlify.toml`) allowed scripts from `'self'` and `https://esm.sh` only, and omitted `'wasm-unsafe-eval'`. Execution could not work in production as configured. |
| It ran on the main thread | `while True:` froze the tab permanently. A stop button was impossible. |
| One interpreter on `window` | State bled between cells, between notebooks, and across navigations. No kernel restart. |
| It ran on the reader's origin | Pyodide's `js` module — and any JS/TS runtime added later — reached `localStorage`, IndexedDB and the Supabase anon client. |

The last one is why the design leads with isolation rather than with languages.

## Architecture

### Kernel protocol

`@tutors/runtime` (`packages/svelte/utils/runtime`, alongside `@tutors/scorm`) defines one
language-agnostic protocol, shaped like Jupyter's so that notebooks and playgrounds share a
single execution path:

```
execute { runtime, mode, files, entry, packages } → status* → stream(stdout|stderr)* → result | error → done
restart
```

Exactly one `done` ends a run. `mode` is `script` (a whole program in a clean namespace),
`cell` (a notebook cell in the namespace earlier cells shared) or `test` (the exercise's
checks). UI code never touches Pyodide or the TypeScript compiler directly — it holds a
`Kernel` and subscribes to events. `Kernel.subscribe()` returns an unsubscribe function, so
a notebook can watch its kernel for its whole life while each cell listens only for the
duration of its own run.

### Isolation

Execution happens in `apps/reader/static/runtimes/runtime-host.html`, framed with
`sandbox="allow-scripts"` and **without** `allow-same-origin`. The opaque origin is what
denies student code access to reader storage, cookies and the Supabase client. The page and
the frame talk over `postMessage`, namespaced `tutors-runtime` and carrying a per-kernel
token; the kernel additionally checks that a message came from its own frame's
`contentWindow`.

Inside the frame, one Web Worker per kernel. The worker is **created from a blob**:
`kernel-worker.js` is fetched as text and started with `URL.createObjectURL`, because an
opaque origin cannot load a worker by URL.

Three consequences of the opaque origin shape everything the worker does, and each was
found by running it in Chromium rather than by reading a specification:

| Rule | Consequence |
|------|-------------|
| A module worker's script is fetched with CORS, which a blob URL minted in a sandbox cannot satisfy | The worker is a **classic** worker. Module workers fail to start, from a `blob:` or a `data:` URL alike. |
| `importScripts` refuses a cross-origin script here, though `fetch` of the same URL succeeds | Engines are loaded by `import()` (Pyodide, an ES module) or by fetching the text and calling it with a module object (the TypeScript compiler, a CommonJS bundle). |
| Pyodide declines to run in a classic worker, testing for one by calling `importScripts` | The worker removes `importScripts` from its global scope before loading Pyodide. Nothing else uses it. |

This follows the existing Excalidraw pattern (`static/excalidraw-editor.html`), with the
sandbox tightened: the whiteboard frame is trusted content, this one is not.

Runtime assets are served from `/runtimes/*` with `Access-Control-Allow-Origin: *` and
`Cross-Origin-Resource-Policy: cross-origin`, because fetches from an opaque origin are
cross-origin.

**Stop is `worker.terminate()` plus respawn.** Resumable interrupts would need
`SharedArrayBuffer`, which needs COOP/COEP, which would break cross-origin course images,
video embeds and the SCORM proxy. Not worth it for a stop button. Every run also has a
60-second ceiling (`DEFAULT_TIMEOUT_MS`) after which the kernel discards the worker and
answers the caller, so a runaway loop cannot hold the Run button hostage.

### Language engines

All three live in `apps/reader/static/runtimes/kernel-worker.js`, plain JavaScript served as
a static file rather than bundled, since the sandbox loads it as text.

| Language | Engine | Notes |
|----------|--------|-------|
| Python | Pyodide, **self-hosted** under `static/runtimes/pyodide/` | No CDN in the CSP, version pinned, works offline. `test` mode runs `unittest` when the file declares test cases, otherwise `runpy`. |
| JavaScript | The worker's own realm, with `console` captured | No DOM, no `window`, no route back to the reader — the opaque origin is the boundary, not a second interpreter. |
| TypeScript | Self-hosted `typescript` `transpileModule`, plus diagnostics against the shipped `lib.*.d.ts` | Diagnostics are surfaced, not stripped — type errors are the pedagogical point. |

For `test` mode in JavaScript and TypeScript, `test(name, fn)`, `assert(...)` and
`assertEquals(...)` are provided as globals: a beginner should not have to wire up a test
framework to run the lecturer's checks. TypeScript is given ambient declarations for those
three in test mode, without which the compiler would reject every test file an author could
write.

JavaScript and TypeScript have no file system in the worker, so a workspace's `.json`,
`.csv` and `.txt` files become modules exporting their contents — `import rows from
"./data.json"`. Python simply opens them: its workspace is written to Pyodide's `/workspace`.

Nothing downloads until a kernel starts, and a playground starts its kernel while the
student is still reading the exercise. Progress arrives as `status` events.

### Vendored assets

`scripts/sync-runtimes.ts` copies Pyodide, the TypeScript compiler with its `lib.*.d.ts`,
and KaTeX's CSS and fonts out of `node_modules` into `apps/reader/static/runtimes/`, and
writes a `config.json` recording the paths and versions the worker reads at run time. Those
folders are gitignored; `pnpm runtimes:sync` runs as the first step of `dev`, `dev:reader`
and `build`.

KaTeX is here for the same CSP reason: notebook maths was styled from `cdn.jsdelivr.net`
against a `style-src 'self'` policy, so it was unstyled in production.

### The `playground` learning object

A simple LO type, added the same way `notebook` and `scorm` were:

- type in `packages/jsr/model/src/types/learning-objects.ts` and `type-utils.ts`
- `buildPlayground` in `packages/jsr/gen/src/services/course-builder.ts`
- Vento templates `Playground.vto` and `components/cards/PlaygroundCard.vto`
- reader route `(course-reader)/playground/[courseid]/[...loid]`
- `ui-components/learning-objects/content/playground`

Authored as a flat `playground-*` folder. Everything is optional: a folder holding one
`main.py` is a valid playground. `main.*` is taken as the entry point, the runtime follows
its extension, `.json`/`.txt`/`.csv` are carried in as data, a `test_*`/`*_test.*`/`*.spec.*`
file becomes the checks rather than part of the workspace, and files over 256 KB are left
out rather than inlined into the course tree. `playground.yaml` overrides any of that with
`runtime`, `entry`, `tests`, `packages` and `readOnly`.

### Workspace state

`WorkspaceStore` has two implementations: `indexedDbStore()` (the default) and
`memoryStore()` (shared links, and tests). Storage is a convenience, never a precondition —
a browser in private mode gets a working playground that forgets between visits.

`mergeWorkspace` lays saved edits over the authored files: the author wins on read-only
status so a corrected scaffold reaches students who already started, the student wins on
content so their edits are never silently reverted, and anything in storage the exercise no
longer mentions is kept, because storage cannot tell a withdrawn scaffold from a file the
student made.

Share links carry a deflate-compressed workspace in the URL **fragment**, so sharing never
hands anyone's code to the reader's host or its logs. A student can open, edit and share a
runnable link with no account; an educator can hand out a pre-seeded starting point the same
way.

### Notebook convergence

`NotebookCodeEditor.svelte` runs on the kernel client: one kernel per notebook page
(`notebook-kernel.svelte.ts`, provided through Svelte context) instead of a `window` global,
with Run All, Restart Kernel, execution counts and a per-cell status. Notebook cells and
playgrounds share `CodeEditor.svelte`, one CodeMirror wrapper with dynamic imports and
`Mod-Enter` to run.

Which cells are runnable is unchanged from the original Jupyter work: a cell tagged
`exercise` in its notebook metadata becomes an editor, and every other cell renders as
authored. Run All therefore means the exercise cells, in order, on the one kernel.

### Headers

`apps/reader/netlify.toml` adds `'wasm-unsafe-eval'` and `worker-src 'self' blob:` to the
reader's policy, and gives `/runtimes/*` its own looser policy plus CORS and CORP.
`apps/reader/vite.config.ts` carries the same rules for local development, hooked onto the
HTTP server rather than added as a middleware — Vite serves `static/` from a middleware of
its own that runs ahead of every plugin's, so a middleware here would see the 404s and none
of the files it is about. No global COOP/COEP.

## Educator access to a student's workspace

### Real identity on Supabase writes

The rest of Tutors reaches Supabase with the **anon key** and `USING (true)` policies:
identity is client-asserted. Student source code does not enter that model.

`/api/runtime-token` mints a short-lived HS256 Supabase JWT from the Auth.js GitHub session,
signed with `PRIVATE_SUPABASE_JWT_SECRET` using SubtleCrypto (no new dependency). The
endpoint decides the `educator_courses` claim itself, by reading the course's own
`tutors.json` and checking `enrollment.educators` — a page cannot assert it. Without the
secret the endpoint answers 501 and every feature below simply does not appear.

`playground_snapshots` (`supabase/migrations/20260910_create_playground_snapshots.sql`) is
the first Tutors table whose rows have an owner, and the first whose row-level security
means anything: students reach `student_id = auth.jwt() ->> 'sub'`, educators get a
select-only policy over `educator_courses`, and the anon role appears in no policy at all.

### Snapshot view

A `playground:view` permission in `packages/svelte/utils/rbac` — documentation of intent;
the database policies are the enforcement. A student presses "hand in" to upsert their
workspace and last output; an educator opens the submissions for an exercise and reads any
of them, read-only.

### Live attach

A Realtime **broadcast** channel `playground:{courseId}:{loId}`
(`community/src/services/playground-live.svelte.ts`), modelled on `presence.svelte.ts`.
Nothing is stored. It is off until the student ticks it on, throttled to 1.5 s, ends when
they untick it or leave the page, and shows a "your lecturer is watching" indicator while
anyone is. Read-only: no remote editing.

## Testing

Following the SCORM convention:

- `tests/unit/runtime/` — the kernel protocol against a fake sandbox
  (`tests/support/runtime-kernel-harness.ts`), workspace merge semantics, share-link
  round trips, editor language mapping
- `tests/unit/gen/playground-builder.test.ts` — a real course folder parsed end to end
- `tests/unit/community/playground-store.test.ts` — the token bridge and snapshot store
- `tests/bdd/features/student/playground-coding.feature` and
  `tests/bdd/features/instructor/playground-authoring.feature`, with executable step mirrors

The unit tests speak the protocol to a fake sandbox, which is the right shape for the
protocol and says nothing about whether an engine boots. That was checked by hand in
Chromium against a generated course, and it is where every defect listed above was found:
the workspace failing to clone across `postMessage`, `importScripts` refusing the engines,
Pyodide refusing a classic worker, TypeScript rejecting its own checks harness, data files
unreachable from JavaScript, and the dev server dropping the run-time headers. None of them
could have failed a test that mocks the sandbox.

Still worth adding, therefore: a Playwright e2e that boots Pyodide in Chromium and runs an
exercise end to end, so those six stay fixed.

## Risks

**Hidden tests are not hidden.** Client-side execution ships tests and solutions to the
browser. The playground is formative; summative grading needs a server-side runner.

**iOS Safari WASM memory limits** will affect large Pyodide sessions — the UI needs a
graceful "runtime unavailable on this device" path.

**Snapshot growth** is every student times every playground they hand in, and needs a
retention policy.

## Java, out of scope for now

CheerpJ 4 is the only credible way to run `javac` and a JVM in the browser, but its licence
is free only for non-commercial and educational use, and tutors.dev's status under that is
unresolved. Rather than block on a licensing answer, Java is deferred to a separate piece of
work now that the kernel protocol exists. The alternatives — TeaVM-precompiled harnesses (no
in-browser compiler, so students cannot really develop) and a containerised server-side
runner (real tooling, but hosting cost and abuse surface) — should be weighed then, against
a working protocol rather than a hypothetical one.
