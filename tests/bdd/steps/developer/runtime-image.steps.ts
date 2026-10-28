import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { load } from "js-yaml";
import { expect } from "vitest";
import { REPO_ROOT } from "../../../../scripts/checks/lib/repo.ts";

const feature = await loadFeature("tests/bdd/features/developer/runtime-image.feature");

/** The Dockerfile from `FROM … AS runtime` to the next stage or the end, with line continuations joined. */
function runtimeStage(): string {
  const text = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8").replace(/\\\n\s*/g, " ");
  const start = text.search(/^FROM\s+\S+\s+AS\s+runtime\b/im);
  expect(start, "the Dockerfile has a runtime stage").toBeGreaterThanOrEqual(0);
  const rest = text.slice(start);
  const next = rest.slice(1).search(/^FROM\s/im);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/** The runtime stage's HEALTHCHECK: its options and its exec-form command. */
function healthcheck(stage: string): { options: string; command: string[] } {
  const line = /^HEALTHCHECK\s+(.*?)\s*CMD\s+(\[.*\])\s*$/m.exec(stage);
  expect(line, "the runtime stage declares an exec-form HEALTHCHECK ... CMD [...]").not.toBeNull();
  return { options: line![1]!, command: JSON.parse(line![2]!) as string[] };
}

/** Listen on an ephemeral port, answering `/healthz/live` with `status` (404 for anything else). */
async function liveness(status: number): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    res.statusCode = req.url === "/healthz/live" ? status : 404;
    res.end(JSON.stringify({ status: status === 200 ? "ok" : "down" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

/** A port that was free a moment ago: bound, read and released. */
async function freePort(): Promise<number> {
  const { server, port } = await liveness(200);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** Run the healthcheck command as Docker would (node from this test's runtime), with PORT set; resolve its exit code. */
function runHealthcheck(command: string[], port: number): Promise<number> {
  const [bin, ...args] = command;
  expect(bin, "the healthcheck runs node, the only tool the runtime image keeps").toBe("node");
  return new Promise((resolve) => {
    execFile(process.execPath, args, { env: { ...process.env, PORT: String(port) }, timeout: 10_000 }, (error) => {
      resolve(error ? (typeof error.code === "number" ? error.code : 1) : 0);
    });
  });
}

/** The Dockerfile's FROM lines, line continuations joined: the image (after build-arg defaults) and the stage name. */
function fromLines(): { image: string; stage?: string }[] {
  const text = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8").replace(/\\\n\s*/g, " ");
  const args = new Map([...text.matchAll(/^ARG\s+(\w+)=(\S+)/gm)].map((m) => [m[1]!, m[2]!]));
  return [...text.matchAll(/^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/gim)].map((m) => ({
    image: m[1]!.replace(/\$\{(\w+)\}/g, (_all, name: string) => args.get(name) ?? ""),
    ...(m[2] ? { stage: m[2] } : {})
  }));
}

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  let stage = "";
  const givenStage = () => {
    stage = runtimeStage();
  };

  Rule("Tutors shall ship its runtime images with no package manager, removing npm, npx, corepack and yarn in the runtime stage.", ({ RuleScenario }) => {
    RuleScenario("The runtime stage removes every package manager", ({ Given, Then, And }) => {
      const removes = (path: string) => {
        const rm = stage.split("\n").filter((line) => /^RUN\b/.test(line) && /\brm\s+-rf\b/.test(line));
        expect(rm.some((line) => line.split(/\s+/).includes(path)), `a RUN rm -rf in the runtime stage names ${path}`).toBe(true);
      };
      Given("the runtime stage of the repository's Dockerfile", givenStage);
      Then("it removes {string}, where npm and corepack live", (_ctx: unknown, path: string) => removes(path));
      And("it removes the commands {string}", (_ctx: unknown, paths: string) => {
        for (const path of paths.split(",").map((p) => p.trim())) removes(path);
      });
    });

    RuleScenario("The runtime stage still starts the app with node alone", ({ Given, Then }) => {
      Given("the runtime stage of the repository's Dockerfile", givenStage);
      Then("its command runs {string}", (_ctx: unknown, command: string) => {
        const cmd = /^CMD\s+(\[.*\])/m.exec(stage);
        expect(cmd, "the runtime stage has an exec-form CMD").not.toBeNull();
        expect((JSON.parse(cmd![1]!) as string[]).join(" ")).toBe(command);
      });
    });
  });

  Rule("Tutors shall build its images on a Node base image pinned by digest, moved only by a Dependabot pull request.", ({ RuleScenario }) => {
    let froms: { image: string; stage?: string }[] = [];
    RuleScenario("The Dockerfile's base image is pinned by digest", ({ Given, Then, And }) => {
      Given("the repository's Dockerfile", () => {
        froms = fromLines();
      });
      Then("every stage that names a registry image names it with a sha256 digest", () => {
        const stages = new Set(froms.flatMap((f) => (f.stage ? [f.stage] : [])));
        const images = froms.filter((f) => !stages.has(f.image));
        expect(images.length, "the Dockerfile names at least one registry image").toBeGreaterThan(0);
        for (const f of images) expect(f.image, `FROM ${f.image}`).toMatch(/^[\w.-]+(?:\/[\w.-]+)+:[\w.-]+@sha256:[0-9a-f]{64}$/);
      });
      And("the base and runtime stages build on the pinned stage unless NODE_IMAGE says otherwise", () => {
        const pinned = froms.find((f) => /@sha256:/.test(f.image))!.stage;
        for (const name of ["base", "runtime"]) expect(froms.find((f) => f.stage === name)?.image, `the ${name} stage`).toBe(pinned);
      });
    });

    let dependabot: { updates?: { "package-ecosystem": string; directory: string; ignore?: unknown[] }[] } = {};
    RuleScenario("Dependabot watches the Dockerfile's base image", ({ Given, Then, And }) => {
      Given("the repository's Dependabot configuration", () => {
        dependabot = load(readFileSync(join(REPO_ROOT, ".github/dependabot.yml"), "utf8")) as typeof dependabot;
      });
      let docker: NonNullable<typeof dependabot.updates>[number] | undefined;
      Then("it updates the {string} ecosystem in {string}", (_ctx: unknown, ecosystem: string, directory: string) => {
        docker = dependabot.updates?.find((u) => u["package-ecosystem"] === ecosystem && u.directory === directory);
        expect(docker, `a ${ecosystem} update in ${directory}`).toBeDefined();
      });
      And("it ignores no update to it", () => {
        // Node patch releases and Debian fixes are what the base image carries: an ignore would let the pin go stale.
        expect(docker!.ignore ?? []).toEqual([]);
      });
    });
  });

  let server: Server | undefined;
  let port = 0;
  let exitCode: number | undefined;
  AfterEachScenario(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    exitCode = undefined;
  });
  const answering = async (_ctx: unknown, status: number) => {
    ({ server, port } = await liveness(status));
  };
  const runs = async () => {
    exitCode = await runHealthcheck(healthcheck(stage).command, port);
  };
  const passes = () => expect(exitCode, "the healthcheck exits 0").toBe(0);
  const fails = () => expect(exitCode, "the healthcheck exits non-zero").not.toBe(0);

  Rule("Tutors shall declare a HEALTHCHECK in its runtime images that passes only while the app answers its liveness route /healthz/live, asked with node alone.", ({ RuleScenario }) => {
    RuleScenario("The runtime stage declares a healthcheck on the liveness route", ({ Given, Then }) => {
      Given("the runtime stage of the repository's Dockerfile", givenStage);
      Then("it declares a HEALTHCHECK whose command runs {string} and asks {string}", (_ctx: unknown, bin: string, path: string) => {
        const { options, command } = healthcheck(stage);
        expect(command[0]).toBe(bin);
        expect(command.join(" ")).toContain(path);
        // Without a timeout a hung server would hold the check for Docker's 30s default.
        expect(options).toMatch(/--timeout=\d+s/);
      });
    });

    RuleScenario("The healthcheck passes while the liveness route answers OK", ({ Given, And, When, Then }) => {
      Given("the runtime stage of the repository's Dockerfile", givenStage);
      And("an app whose liveness route answers {number} on the port named by PORT", answering);
      When("the image's healthcheck command runs", runs);
      Then("the healthcheck shall pass", passes);
    });

    RuleScenario("The healthcheck fails while the liveness route answers an error", ({ Given, And, When, Then }) => {
      Given("the runtime stage of the repository's Dockerfile", givenStage);
      And("an app whose liveness route answers {number} on the port named by PORT", answering);
      When("the image's healthcheck command runs", runs);
      Then("the healthcheck shall fail", fails);
    });

    RuleScenario("The healthcheck fails when nothing is listening", ({ Given, And, When, Then }) => {
      Given("the runtime stage of the repository's Dockerfile", givenStage);
      And("no app listening on the port named by PORT", async () => {
        port = await freePort();
      });
      When("the image's healthcheck command runs", runs);
      Then("the healthcheck shall fail", fails);
    });
  });
});
