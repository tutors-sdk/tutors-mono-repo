import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { readText, REPO_ROOT } from "../../../../scripts/checks/lib/repo.ts";
import {
  codeFindings,
  codeReads,
  envFileFindings,
  overlayFindings,
  overlayVariables,
  processVerdict,
  readsIn,
  type EnvRead
} from "../../../../scripts/checks/env-contract.ts";
import { requiredVariables } from "../../../../packages/svelte/app-config/src/env-contract.js";

type App = "reader" | "catalogue" | "live" | "time";

// The apps read $app/env through module namespaces; these mocks read a store each scenario fills.
const store = vi.hoisted(() => {
  // The apps' server hooks read the APP_VERSION global Vite defines at build time.
  (globalThis as { APP_VERSION?: string }).APP_VERSION = "test";
  return { values: {} as Record<string, string | undefined>, errors: [] as { message: string; fields?: { missing?: string[] } }[] };
});
vi.mock("$app/env", () => ({ building: true }));
vi.mock("$app/env/public", async () => {
  const { ENV_CONTRACT } = await import("../../../../packages/svelte/app-config/src/env-contract.js");
  const module = {};
  for (const [name, v] of Object.entries(ENV_CONTRACT)) if (v.public) Object.defineProperty(module, name, { get: () => store.values[name], enumerable: true });
  return module;
});
vi.mock("$app/env/private", async () => {
  const { ENV_CONTRACT } = await import("../../../../packages/svelte/app-config/src/env-contract.js");
  const module = {};
  for (const [name, v] of Object.entries(ENV_CONTRACT)) if (!v.public) Object.defineProperty(module, name, { get: () => store.values[name], enumerable: true });
  return module;
});
vi.mock("@tutors/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tutors/logger")>();
  const log = { error: (message: string, fields?: { missing?: string[] }) => store.errors.push({ message, fields }), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { ...actual, default: log, setAppName: vi.fn(), installProcessLogging: vi.fn(), logServiceStart: vi.fn() };
});
vi.mock("../../../../packages/svelte/community/src/utils/health-check.ts", () => ({
  checkSupabase: async () => ({ status: "skipped", latencyMs: 0 }),
  getRecentErrorCounts: async () => ({})
}));
vi.mock("../../../../packages/svelte/course/src/course/index.ts", () => ({ setCourseNotFoundHandler: vi.fn(), setCourseUnreachableHandler: vi.fn(), setCourseTimedOutHandler: vi.fn() }));
vi.mock("../../../../packages/svelte/utils/i18n/src/index.ts", () => ({ initLocaleFromCookie: vi.fn() }));
vi.mock("../../../../apps/reader/node_modules/@sveltejs/kit/src/exports/hooks/index.js", () => ({ sequence: vi.fn() }));

const feature = await loadFeature("tests/bdd/features/developer/environment-contract.feature");

const APP_NAMES: Record<string, App> = { "reader's": "reader", "catalogue's": "catalogue", "live dashboard's": "live", "time dashboard's": "time" };
const list = (names: string) => names.split(",").map((n) => n.trim()).filter(Boolean);
/** A value no one would mistake for a name, so an answer that leaks values is caught. */
const secretValue = (name: string) => `value-of-${name.toLowerCase()}-5e1f`;

describeFeature(feature, ({ Rule }) => {
  let app: App;
  let response: Response | undefined;
  let body: Record<string, unknown> & { checks?: { environment?: { status: string; missing: string[] } } };
  let verdict: ReturnType<typeof processVerdict>;
  let findings: string[];

  function signedIn(target: App, except: string[] = []) {
    app = target;
    store.values = { PUBLIC_ANON_MODE: "FALSE" };
    for (const name of requiredVariables(target, store.values)) if (!except.includes(name)) store.values[name] = secretValue(name);
  }

  async function startServer() {
    store.errors = [];
    const { init } = await import(`../../../../apps/${app}/src/hooks.server.ts`);
    await init();
  }

  async function askReadiness() {
    const { GET } = await import(`../../../../apps/${app}/src/routes/healthz/+server.ts`);
    response = (await GET({} as never)) as Response;
    body = await response.json();
  }

  function environmentErrors() {
    return store.errors.filter((e) => e.message.startsWith("Environment incomplete"));
  }

  function noValuesIn(text: string) {
    for (const [name, value] of Object.entries(store.values)) {
      if (value && value.startsWith("value-of-")) expect(text, `${name}'s value`).not.toContain(value);
    }
  }

  Rule("If a deployment lacks a variable the environment contract says its app needs, then tutors shall log one error at startup naming every missing variable.", ({ RuleScenario }) => {
    RuleScenario("The reader starts without the service-role key and the allowed origins", ({ Given, When, Then }) => {
      Given("the reader's environment has sign-in on and every variable it needs except {string}", (_ctx, names: string) => signedIn("reader", list(names)));
      When("the reader's server starts", startServer);
      Then("it logs one error naming {string}", (_ctx, names: string) => {
        const errors = environmentErrors();
        expect(errors).toHaveLength(1);
        expect(errors[0]!.fields?.missing).toEqual(list(names));
      });
    });

    RuleScenario("A blank value counts as missing", ({ Given, When, Then }) => {
      Given("the time dashboard's environment has sign-in on and every variable it needs, with {string} set to spaces", (_ctx, name: string) => {
        signedIn("time");
        store.values[name] = "   ";
      });
      When("the time dashboard's server starts", startServer);
      Then("it logs one error naming {string}", (_ctx, names: string) => {
        const errors = environmentErrors();
        expect(errors).toHaveLength(1);
        expect(errors[0]!.fields?.missing).toEqual(list(names));
      });
    });

    RuleScenario("A complete environment logs no error", ({ Given, When, Then }) => {
      Given("the catalogue's environment has sign-in on and every variable it needs", () => signedIn("catalogue"));
      When("the catalogue's server starts", startServer);
      Then("it logs no environment error", () => expect(environmentErrors()).toEqual([]));
    });
  });

  function answersMisconfigured(_ctx: unknown, status: string, names: string) {
    expect(response!.status).toBe(503);
    expect(body.status).toBe(status);
    expect(body.checks?.environment).toEqual({ status: "missing", missing: list(names) });
  }

  function answersReady(_ctx: unknown, status: string) {
    expect(response!.status).toBe(200);
    expect(body.checks?.environment?.status).toBe(status);
  }

  Rule("If a deployment lacks a variable the environment contract says its app needs, then tutors shall answer its readiness route /healthz with 503 and the names of the missing variables, without their values.", ({ RuleScenario }) => {
    RuleScenario("The reader's readiness route reports what it lacks", ({ Given, When, Then, And }) => {
      Given("the reader's environment has sign-in on and every variable it needs except {string}", (_ctx, names: string) => signedIn("reader", list(names)));
      When("the reader's readiness route is asked", askReadiness);
      Then("it answers 503 with status {string} and missing {string}", answersMisconfigured);
      And("the answer contains none of the environment's values", () => noValuesIn(JSON.stringify(body)));
    });

    RuleScenario("A complete environment is ready", ({ Given, When, Then }) => {
      Given("the live dashboard's environment has sign-in on and every variable it needs", () => signedIn("live"));
      When("the live dashboard's readiness route is asked", askReadiness);
      Then("it answers 200 with the environment check {string}", answersReady);
    });
  });

  Rule("While PUBLIC_ANON_MODE is TRUE, tutors shall leave the Supabase and sign-in variables out of the variables a deployment needs.", ({ RuleScenario }) => {
    function only(_ctx: unknown, mode: string) {
      app = "reader";
      store.values = { PUBLIC_ANON_MODE: mode };
    }

    RuleScenario("An anonymous reader needs no Supabase or sign-in variables", ({ Given, When, Then }) => {
      Given("the reader's environment has PUBLIC_ANON_MODE {string} and nothing else", only);
      When("the reader's readiness route is asked", askReadiness);
      Then("it answers 200 with the environment check {string}", answersReady);
    });

    RuleScenario("A reader with sign-in on needs them", ({ Given, When, Then }) => {
      Given("the reader's environment has PUBLIC_ANON_MODE {string} and nothing else", only);
      When("the reader's readiness route is asked", askReadiness);
      Then("it answers 503 with status {string} and missing {string}", answersMisconfigured);
    });
  });

  Rule("When a Netlify production build starts without a variable the environment contract says its app needs, tutors shall fail the build before compiling and name the missing variables.", ({ RuleScenario }) => {
    RuleScenario("Every app's Netlify build checks its environment before it compiles", ({ Given, Then }) => {
      const commands: Partial<Record<App, string>> = {};
      Given("each app's netlify.toml", () => {
        for (const a of Object.values(APP_NAMES)) commands[a] = /^\s*command\s*=\s*"(.*)"\s*$/m.exec(readText(join(REPO_ROOT, "apps", a, "netlify.toml")))?.[1];
      });
      Then("its build command runs {string} after installing and before building", (_ctx, template: string) => {
        for (const [a, command] of Object.entries(commands)) {
          const steps = command!.split("&&").map((s) => s.trim());
          const check = steps.indexOf(template.replace("<app>", a));
          expect(check, `${a}: ${command}`).toBeGreaterThan(steps.findIndex((s) => s.startsWith("pnpm install")));
          expect(check, `${a}: ${command}`).toBeLessThan(steps.findIndex((s) => s.endsWith(" build")));
        }
      });
    });

    function netlifyBuild(context: string, except: string[]) {
      signedIn("reader", except);
      store.values = { ...store.values, NETLIFY: "true", CONTEXT: context };
    }
    const runCheck = () => {
      verdict = processVerdict(app, store.values);
    };

    RuleScenario("A production build without the service-role key fails", ({ Given, When, Then, And }) => {
      Given("a Netlify build with CONTEXT {string} for the reader, with sign-in on and every variable it needs except {string}", (_ctx, context: string, names: string) => netlifyBuild(context, list(names)));
      When("the environment check runs for the reader", runCheck);
      Then("it fails naming {string}", (_ctx, names: string) => {
        expect(verdict.outcome).toBe("fail");
        for (const name of list(names)) expect(verdict.lines).toContain(`  - ${name}`);
      });
      And("its output contains none of the environment's values", () => noValuesIn(verdict.lines.join("\n")));
    });

    RuleScenario("A deploy preview without it warns and builds", ({ Given, When, Then }) => {
      Given("a Netlify build with CONTEXT {string} for the reader, with sign-in on and every variable it needs except {string}", (_ctx, context: string, names: string) => netlifyBuild(context, list(names)));
      When("the environment check runs for the reader", runCheck);
      Then("it warns naming {string} and lets the build go on", (_ctx, names: string) => {
        expect(verdict.outcome).toBe("warn");
        for (const name of list(names)) expect(verdict.lines).toContain(`  - ${name}`);
      });
    });

    RuleScenario("A production build with everything passes", ({ Given, When, Then }) => {
      Given("a Netlify build with CONTEXT {string} for the reader, with sign-in on and every variable it needs", (_ctx, context: string) => netlifyBuild(context, []));
      When("the environment check runs for the reader", runCheck);
      Then("it passes", () => expect(verdict.outcome).toBe("pass"));
    });
  });

  function failsNaming(_ctx: unknown, where: string, name: string) {
    expect(findings.some((f) => f.includes(where) && f.includes(name)), findings.join("\n")).toBe(true);
  }

  Rule("If code reads an environment variable the environment contract does not declare for the app reading it, then tutors shall fail the environment check naming the file and the variable.", ({ RuleScenario }) => {
    let reads: EnvRead[];
    function fileReading(_ctx: unknown, file: string, name: string) {
      const app = file.split("/")[1] as App;
      reads = [...codeReads(), ...readsIn(file, `import * as env from "$app/env/private";\nexport const key = env.${name};\n`, app)];
    }

    RuleScenario("The repository's code reads only declared variables", ({ When, Then }) => {
      When("the environment check reads the repository's code", () => {
        findings = codeFindings(codeReads());
      });
      Then("it finds no code finding", () => expect(findings).toEqual([]));
    });

    RuleScenario("A new variable read without a contract entry fails", ({ Given, When, Then }) => {
      Given("a file {string} that reads {string} from the private environment", fileReading);
      When("the environment check reads that code", () => {
        findings = codeFindings(reads);
      });
      Then("it fails naming {string} and {string}", failsNaming);
    });

    RuleScenario("A declared variable read by an app the contract does not list fails", ({ Given, When, Then }) => {
      Given("a file {string} that reads {string} from the private environment", fileReading);
      When("the environment check reads that code", () => {
        findings = codeFindings(reads);
      });
      Then("it fails naming {string} and {string}", failsNaming);
    });
  });

  Rule("If a variable in the environment contract has no line in .env.example or deploy/staging/.env.example, then tutors shall fail the environment check naming the file and the variable.", ({ RuleScenario }) => {
    const repositoryFiles = () => Object.fromEntries([".env.example", "deploy/staging/.env.example"].map((p) => [p, readText(join(REPO_ROOT, p))]));
    let files: Record<string, string>;

    RuleScenario("The repository's example files list every variable", ({ When, Then }) => {
      When("the environment check reads the repository's example env files", () => {
        findings = envFileFindings(repositoryFiles());
      });
      Then("it finds no example file finding", () => expect(findings).toEqual([]));
    });

    RuleScenario("An example file without the service-role key fails", ({ Given, When, Then }) => {
      Given("{string} without its {string} line", (_ctx, file: string, name: string) => {
        files = repositoryFiles();
        files[file] = files[file]!.replace(new RegExp(`^${name}=.*$`, "m"), "");
      });
      When("the environment check reads that example file", () => {
        findings = envFileFindings(files);
      });
      Then("it fails naming {string} and {string}", failsNaming);
    });
  });

  Rule("If a variable an app needs has no entry in that app's Kubernetes ConfigMap or secrets example, then tutors shall fail the environment check naming the app and the variable.", ({ RuleScenario }) => {
    let overlays: ReturnType<typeof overlayVariables>;

    RuleScenario("The repository's overlays provide every variable each app needs", ({ When, Then }) => {
      When("the environment check reads the repository's overlays", () => {
        findings = overlayFindings(overlayVariables());
      });
      Then("it finds no overlay finding", () => expect(findings).toEqual([]));
    });

    RuleScenario("A reader overlay without the allowed origins fails", ({ Given, When, Then }) => {
      Given("the reader overlay without {string}", (_ctx, name: string) => {
        overlays = overlayVariables();
        overlays.reader!.delete(name);
      });
      When("the environment check reads those overlays", () => {
        findings = overlayFindings(overlays);
      });
      Then("it fails naming {string} and {string}", failsNaming);
    });
  });
});
