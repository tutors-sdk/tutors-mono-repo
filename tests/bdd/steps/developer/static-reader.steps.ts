import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { createSvelteKitOptions, STATIC_FALLBACK, STATIC_OUT, staticVersion } from "../../../../packages/svelte/app-config/src/svelte.js";
import { versionInfo } from "../../../../packages/svelte/utils/runtime/src/version.ts";
import { rootData, type RootData } from "../../../../apps/reader/src/lib/root-data.ts";
import { actorData } from "../../../../apps/reader/src/lib/actor-data.ts";

// `rune()` needs the Svelte compiler; @tutors/i18n holds the locale in one. See the stub.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));

const feature = await loadFeature("tests/bdd/features/developer/static-reader.feature");

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  const saved = process.env.SVELTEKIT_ADAPTER;
  let adapterName = "";
  let anonymous = true;
  let cookie = "";
  let answer: Response | undefined;
  let requests: string[] = [];
  let data: RootData | undefined;
  let pkg = { name: "", version: "" };
  let env: Record<string, string> = {};
  let written: unknown;

  AfterEachScenario(() => {
    if (saved === undefined) delete process.env.SVELTEKIT_ADAPTER;
    else process.env.SVELTEKIT_ADAPTER = saved;
    cookie = "";
    answer = undefined;
    requests = [];
  });

  const fetcher = (async (input: string | URL | Request) => {
    requests.push(String(input));
    if (!answer) throw new Error(`no server: ${String(input)}`);
    return answer;
  }) as typeof fetch;

  Rule("Where SVELTEKIT_ADAPTER is \"static\", Tutors shall build each app with SvelteKit's static adapter into a folder of files that answers every unknown path with the fallback page 200.html.", ({ RuleScenario }) => {
    const make = () => {
      adapterName = (createSvelteKitOptions().adapter as { name: string }).name;
    };
    const chosen = (_ctx: unknown, name: string) => {
      process.env.SVELTEKIT_ADAPTER = name;
    };
    RuleScenario("The static adapter is chosen, with 200.html as the fallback", ({ Given, When, Then, And }) => {
      Given("SVELTEKIT_ADAPTER is {string}", chosen);
      When("the shared SvelteKit config is made", make);
      Then("the app is built by the adapter {string}", (_ctx: unknown, name: string) => expect(adapterName).toBe(name));
      And("the static build answers unknown paths with {string} in the folder {string}", (_ctx: unknown, fallback: string, folder: string) => {
        expect(STATIC_FALLBACK).toBe(fallback);
        expect(STATIC_OUT).toBe(folder);
      });
    });
    RuleScenario("The container build keeps the Node adapter", ({ Given, When, Then }) => {
      Given("SVELTEKIT_ADAPTER is {string}", chosen);
      When("the shared SvelteKit config is made", make);
      Then("the app is built by the adapter {string}", (_ctx: unknown, name: string) => expect(adapterName).toBe(name));
    });
  });

  Rule("While sign-in is off, the reader shall work out every page's signed-in actor and locale in the browser without a request to any server.", ({ RuleScenario }) => {
    const load = async () => {
      data = await rootData({ anonymous, cookie, fetch: fetcher });
    };
    RuleScenario("An anonymous reader asks no server and reads the locale cookie", ({ Given, And, When, Then }) => {
      Given("sign-in is off", () => {
        anonymous = true;
      });
      And("the browser holds the locale cookie {string}", (_ctx: unknown, value: string) => {
        cookie = `theme=dark; locale=${value}`;
      });
      When("the root layout loads", load);
      Then("no request was made", () => {
        expect(requests).toEqual([]);
      });
      And("the page is signed out with the locale {string}", (_ctx: unknown, locale: string) => {
        expect(data).toEqual({ actor: null, loggedIn: false, user: undefined, locale });
      });
    });
    RuleScenario("A reader with sign-in on asks GET /actor once", ({ Given, And, When, Then }) => {
      Given("sign-in is on", () => {
        anonymous = false;
      });
      And("the reader's server answers GET /actor for the login {string}", (_ctx: unknown, login: string) => {
        answer = Response.json(actorData({ subject: `github:1`, login, name: null, email: null, image: null }));
      });
      When("the root layout loads", load);
      Then("exactly one request was made, to {string}", (_ctx: unknown, path: string) => {
        expect(requests).toEqual([path]);
      });
      And("the page is signed in as {string} with the locale {string}", (_ctx: unknown, login: string, locale: string) => {
        expect(data?.loggedIn).toBe(true);
        expect(data?.user?.login).toBe(login);
        expect(data?.actor?.login).toBe(login);
        expect(data?.locale).toBe(locale);
      });
    });
  });

  Rule("Tutors shall write version.json beside a static build, holding the build identity that GET /version answers.", ({ RuleScenario }) => {
    RuleScenario("version.json holds what /version would answer", ({ Given, When, Then }) => {
      Given("the app {string} at version {string} is built from the commit {string} on {string}", (_ctx: unknown, name: string, version: string, sha: string, date: string) => {
        pkg = { name, version };
        env = { GIT_SHA: sha, BUILD_DATE: date };
      });
      When("the static build writes its version file", () => {
        written = JSON.parse(JSON.stringify(staticVersion(pkg, env)));
      });
      Then("version.json holds the same fields, in the same shape, as GET /version for that build", () => {
        expect(written).toEqual(versionInfo({ app: pkg.name, version: pkg.version, env }));
        // The same for the variables a build may or may not have: Netlify's COMMIT_REF alone, and the harness's frozen clock.
        for (const other of [{ COMMIT_REF: "556c7f2" }, { ...env, HARNESS_NOW: "2026-11-18T22:00:00Z" }, { ...env, HARNESS_NOW: "not a time" }, {}]) {
          expect(staticVersion(pkg, other)).toEqual(versionInfo({ app: pkg.name, version: pkg.version, env: other }));
        }
      });
    });
  });
});
