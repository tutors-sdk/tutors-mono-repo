import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APPS,
  buildIdentityFindings,
  identityLeaks,
  linkedAssets,
  versionFindings,
  type BuildIdentity,
  type Sample
} from "../../scripts/checks/build-identity.ts";
import { REPO_ROOT, readText, toPosix, walk } from "../../scripts/checks/lib/repo.ts";

/**
 * Build identity (commit, build date) is answered by GET /version and nowhere
 * else, on every app. The release harness masks that one route; a sha anywhere
 * else is permanent noise in every comparison. The built-output half of this
 * (real servers, real bundles) is `pnpm check:build-identity`, and the same crawl
 * runs against the image in `pnpm check:container`.
 */
const identity: BuildIdentity = {
  revision: "f00dcafe5eed1e55ab1e0ddba11c0ffeedeadd0c",
  built: "2031-02-03T04:05:06Z",
  version: "16.2.2"
};

const sample = (overrides: Partial<Sample> & Pick<Sample, "path">): Sample => ({ status: 200, headers: [], body: "", kind: "html", ...overrides });

describe("GET /version on every app", () => {
  it.each(APPS)("%s serves /version through the shared runtime seam", (app) => {
    const source = readText(join(REPO_ROOT, "apps", app, "src", "routes", "version", "+server.ts"));
    expect(source).toMatch(/export const GET\b/);
    expect(source).toContain(`versionEndpoint({ app: "tutors-${app}"`);
    expect(source).toContain('from "@tutors/runtime"');
  });

  it("the apps this check covers are the apps in the repo", () => {
    const apps = walk(join(REPO_ROOT, "apps"), (name) => name === "package.json").map((file) => toPosix(join(file, ".."), join(REPO_ROOT, "apps")));
    expect([...apps].sort()).toEqual([...APPS].sort());
  });
});

describe("the sources that read build identity", () => {
  const isSource = (name: string) => /\.(ts|svelte|js)$/.test(name);
  const sources = [...walk(join(REPO_ROOT, "apps"), isSource), ...walk(join(REPO_ROOT, "packages"), isSource)]
    .map((file) => toPosix(file))
    .filter((file) => !file.includes("/static/") && !file.includes("/__tests__/") && !/\.(test|spec)\./.test(file));

  it("are the runtime package, the /version routes and the build configs, and nothing else", () => {
    const readers = sources
      .filter((file) => !file.startsWith("packages/svelte/utils/runtime/"))
      .filter((file) => /\b(GIT_SHA|BUILD_DATE)\b|\bversionInfo\b|\bversionEndpoint\b/.test(readText(join(REPO_ROOT, file))));
    expect(readers.sort()).toEqual(APPS.flatMap((app) => [`apps/${app}/src/routes/version/+server.ts`, `apps/${app}/svelte.config.js`]).sort());
  });

  it.each(APPS)("%s names its SvelteKit build after a hash of the commit, never the commit", (app) => {
    const config = readText(join(REPO_ROOT, "apps", app, "svelte.config.js"));
    // The build name is served in /_app/version.json and compiled into the client bundle.
    expect(config).not.toMatch(/name:\s*gitSha\b/);
    expect(config).toMatch(/createHash\('sha256'\)\.update\(gitSha\)/);
    expect(config).toMatch(/version:\s*\{\s*name:\s*buildName\s*\}/);
  });
});

describe("identityLeaks", () => {
  it("finds the commit, its short form and the build date in a header", () => {
    for (const value of [identity.revision, identity.revision.slice(0, 12), identity.built]) {
      const findings = identityLeaks(sample({ path: "/", headers: [["x-build", `build ${value}`]] }), identity);
      expect(findings).toEqual([expect.stringContaining("a response header carries")]);
    }
  });

  it("finds the commit and the build date in a page, an error page, a script and a JSON file", () => {
    expect(identityLeaks(sample({ path: "/", body: `<meta name="generator" content="${identity.revision}">` }), identity)).toHaveLength(1);
    expect(identityLeaks(sample({ path: "/nope", status: 404, body: `Built ${identity.built}` }), identity)).toHaveLength(1);
    expect(identityLeaks(sample({ path: "/_app/immutable/entry/app.js", kind: "asset", body: `const v="${identity.revision}"` }), identity)).toHaveLength(1);
    expect(identityLeaks(sample({ path: "/_app/version.json", kind: "asset", body: JSON.stringify({ version: identity.revision }) }), identity)).toHaveLength(1);
  });

  it("lets /version, and only /version, carry the identity", () => {
    const body = JSON.stringify({ revision: identity.revision, built: identity.built, version: identity.version });
    expect(identityLeaks(sample({ path: "/version", kind: "other", body }), identity)).toEqual([]);
    expect(identityLeaks(sample({ path: "/healthz", kind: "other", body }), identity).length).toBeGreaterThan(0);
  });

  it("lets the release version appear in the marked footer element and in compiled scripts, and nowhere else", () => {
    const footer = `<p class="pl-4" data-tutors-build="version">Tutors v:${identity.version}</p>`;
    expect(identityLeaks(sample({ path: "/", body: `<body>${footer}</body>` }), identity)).toEqual([]);
    expect(identityLeaks(sample({ path: "/_app/immutable/chunks/x.js", kind: "asset", body: `"v:${identity.version}"` }), identity)).toEqual([]);
    expect(identityLeaks(sample({ path: "/", body: `<body>${footer}<span>v${identity.version}</span></body>` }), identity)).toEqual([
      expect.stringContaining("outside data-tutors-build")
    ]);
    expect(identityLeaks(sample({ path: "/", headers: [["x-app-version", identity.version]] }), identity)).toEqual([expect.stringContaining("release version")]);
  });

  it("does not mistake a longer number for the release version", () => {
    expect(identityLeaks(sample({ path: "/", body: "<p>116.2.20 and 16.2.2.1</p>" }), identity)).toEqual([]);
  });

  it("has nothing to search for when the image was built without an identity", () => {
    const unknown: BuildIdentity = { revision: "unknown", built: "unknown", version: identity.version };
    expect(identityLeaks(sample({ path: "/", body: "unknown unknown" }), unknown)).toEqual([]);
  });
});

describe("linkedAssets", () => {
  it("lists same-origin scripts, stylesheets, preloads, manifests and icons, and not other origins", () => {
    const html = [
      '<link rel="icon" href="/favicon.png">',
      '<link href="/_app/immutable/entry/start.abc.js" rel="modulepreload">',
      '<link rel="stylesheet" href="./_app/immutable/assets/0.css">',
      '<script src="/app.js"></script>',
      '<link rel="stylesheet" href="https://cdn.example/x.css">',
      '<link rel="canonical" href="/somewhere">'
    ].join("\n");
    expect(linkedAssets(html).sort()).toEqual(["/_app/immutable/assets/0.css", "/_app/immutable/entry/start.abc.js", "/app.js", "/favicon.png"]);
  });
});

describe("versionFindings", () => {
  it("wants a 200 JSON answer carrying the identity it was started with", () => {
    const body = JSON.stringify({ app: "tutors-reader", version: identity.version, revision: identity.revision, built: identity.built, clock: "system" });
    expect(versionFindings(sample({ path: "/version", kind: "other", body }), identity)).toEqual([]);
    expect(versionFindings(sample({ path: "/version", kind: "other", status: 404 }), identity)).toEqual(["version: GET /version returned 404"]);
    expect(versionFindings(sample({ path: "/version", kind: "other", body: "<html>" }), identity)).toEqual(["version: GET /version did not answer JSON"]);
    expect(versionFindings(sample({ path: "/version", kind: "other", body: body.replace(identity.revision, "other") }), identity)).toEqual([
      expect.stringContaining("revision is")
    ]);
    expect(versionFindings(undefined)).toEqual(["version: GET /version was not probed"]);
  });
});

/** A stand-in app: answers /version and one page, and can be told to leak into a header, the error page or version.json. */
describe("buildIdentityFindings against a running server", () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function serve(leak?: "header" | "error-page" | "version-json"): Promise<string> {
    const app = createServer((request, response) => {
      const url = request.url ?? "/";
      if (url === "/version") {
        response.setHeader("content-type", "application/json");
        return void response.end(JSON.stringify({ app: "x", version: identity.version, revision: identity.revision, built: identity.built, clock: "system" }));
      }
      if (url === "/_app/version.json") {
        response.setHeader("content-type", "application/json");
        return void response.end(JSON.stringify({ version: leak === "version-json" ? identity.revision : "0f1e2d3c4b5a6978" }));
      }
      if (leak === "header") response.setHeader("x-build", identity.revision);
      response.setHeader("content-type", "text/html");
      if (url === "/") return void response.end(`<html><body><p data-tutors-build="version">v ${identity.version}</p></body></html>`);
      response.statusCode = 404;
      response.end(leak === "error-page" ? `Not found (built ${identity.built})` : "Not found");
    });
    server = app;
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  }

  it("is quiet when only /version answers the identity", async () => {
    expect(await buildIdentityFindings(await serve())).toEqual([]);
  });

  it.each(["header", "error-page", "version-json"] as const)("reports a leak in %s", async (leak) => {
    const findings = await buildIdentityFindings(await serve(leak));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.startsWith("identity: GET "))).toBe(true);
  });
});
