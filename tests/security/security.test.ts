import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditFindings,
  cookieFindings,
  csrfConfigFindings,
  discoverMutatingRoutes,
  headerFindings,
  inventoryFindings,
  loadHeaderContract,
  mutatingRoutesIn,
  parseAudit,
  parseInventory,
  routeIdFromFile,
  type Advisory,
  type HeaderContract
} from "../../scripts/checks/security.ts";
import { REPO_ROOT, readBaseline, readText } from "../../scripts/checks/lib/repo.ts";

const contract = loadHeaderContract();
const APPS = readdirSync(join(REPO_ROOT, "apps"));

/** Headers that satisfy the whole committed contract. */
function compliantHeaders(): Headers {
  return new Headers({
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'self'"
  });
}

describe("security contracts (runway tier M)", () => {
  describe("response headers", () => {
    it("accepts a response that satisfies the committed contract", () => {
      expect(headerFindings("reader", compliantHeaders(), contract)).toEqual([]);
    });

    it("negative fixtures: a dropped CSP, a weakened frame policy and a short HSTS all fail", () => {
      const headers = compliantHeaders();
      headers.delete("Content-Security-Policy");
      headers.set("X-Frame-Options", "ALLOWALL");
      headers.set("Strict-Transport-Security", "max-age=60");
      expect(headerFindings("reader", headers, contract)).toEqual([
        "wrong-header: reader: X-Frame-Options",
        "wrong-header: reader: Strict-Transport-Security",
        "missing-header: reader: Content-Security-Policy"
      ]);
    });

    it("the contract covers every app, and every baseline gap names a real app and a contract header or probed path", () => {
      expect(Object.keys(contract.apps).sort()).toEqual([...APPS].sort());
      for (const rule of Object.values((contract as HeaderContract).headers)) expect(rule.reason.length).toBeGreaterThan(20);
      for (const line of readBaseline(join(REPO_ROOT, "tests/security/known-response-gaps.txt"))) {
        const [, kind, app, subject] = line.match(/^(missing-header|wrong-header|server-error): ([a-z]+): (.+)$/) ?? [];
        expect(APPS, line).toContain(app);
        if (kind === "server-error") expect(contract.apps[app].paths.map((p) => `GET ${p}`), line).toContain(subject);
        else expect(Object.keys(contract.headers), line).toContain(subject);
      }
    });
  });

  describe("cookies", () => {
    it("accepts the flags Auth.js sets over HTTPS and ignores deleted cookies", () => {
      expect(
        cookieFindings(
          "reader",
          [
            "__Secure-authjs.callback-url=https%3A%2F%2Freader.tutors.dev; Path=/; HttpOnly; Secure; SameSite=Lax",
            "__Host-authjs.csrf-token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"
          ],
          { https: true }
        )
      ).toEqual([]);
    });

    it("negative fixtures: missing HttpOnly, SameSite or Secure, and SameSite=None without Secure", () => {
      expect(
        cookieFindings("reader", ["session=abc; Path=/", "tracker=1; Path=/; HttpOnly; SameSite=None"], { https: true })
      ).toEqual([
        "cookie-not-httponly: reader: session",
        "cookie-not-secure: reader: session",
        "cookie-not-secure: reader: tracker",
        "cookie-samesite-none-without-secure: reader: tracker",
        "cookie-without-samesite: reader: session"
      ]);
      expect(cookieFindings("reader", ["session=abc; Path=/; HttpOnly; SameSite=Lax"], { https: false })).toEqual([]);
    });
  });

  describe("CSRF", () => {
    it("negative fixtures: disabling the origin check or trusting every origin fails", () => {
      expect(csrfConfigFindings("svelte.config.js", "kit: { csrf: { checkOrigin: false } }")).toEqual([
        "csrf-check-disabled: svelte.config.js"
      ]);
      expect(csrfConfigFindings("svelte.config.js", "kit: { csrf: { trustedOrigins: ['https://a.dev', '*'] } }")).toEqual([
        "csrf-trusts-any-origin: svelte.config.js"
      ]);
    });

    it.each(APPS)("apps/%s keeps SvelteKit's cross-site form check on", (app) => {
      const file = `apps/${app}/svelte.config.js`;
      expect(csrfConfigFindings(file, readText(join(REPO_ROOT, file)))).toEqual([]);
    });

    it("discovers mutating endpoints and form actions in every export style", () => {
      expect(routeIdFromFile("(course-reader)/course/[courseid]/+server.ts")).toBe("/course/[courseid]");
      expect(routeIdFromFile("+server.ts")).toBe("/");
      const endpoint = `
        export const GET = () => new Response();
        export const POST: RequestHandler = async () => new Response();
        export async function DELETE() { return new Response(); }
        const handler = () => new Response();
        export { handler as PATCH };
      `;
      expect(mutatingRoutesIn("time", "api/[id]/+server.ts", endpoint).map((r) => `${r.method} ${r.route}`)).toEqual([
        "POST /api/[id]",
        "DELETE /api/[id]",
        "PATCH /api/[id]"
      ]);
      const page = `export const actions = { default: async () => {}, publish: async () => {} } satisfies Actions;`;
      expect(mutatingRoutesIn("reader", "(home)/edit/+page.server.ts", page).map((r) => `${r.method} ${r.route}`)).toEqual([
        "POST /edit",
        "POST /edit?/publish"
      ]);
      expect(mutatingRoutesIn("reader", "healthz/+server.ts", "export const GET = () => {};")).toEqual([]);
    });

    it("negative fixtures: an unlisted route, a stale entry and an entry without callers fail; hook routes are exempt from discovery", () => {
      const discovered = [
        { app: "time", method: "POST", route: "/api/sync", file: "x" },
        { app: "time", method: "DELETE", route: "/api/course/[id]", file: "y" }
      ];
      const inventory = parseInventory(
        [
          "# comment",
          "time POST /api/sync | who: lecturers",
          "time PUT /api/gone | who: nobody",
          "reader POST /auth/signout | hook | who: signed-in users",
          "reader POST /auth/signin/github | hook"
        ].join("\n")
      );
      expect(inventoryFindings(discovered, inventory)).toEqual([
        "inventory-entry-without-who: reader POST /auth/signin/github",
        "stale-inventory-entry: time PUT /api/gone",
        "unlisted-mutating-route: time DELETE /api/course/[id]"
      ]);
    });

    it("every mutating route in the apps is in the inventory with its callers", () => {
      const inventory = parseInventory(readText(join(REPO_ROOT, "tests/security/mutating-routes.txt")));
      expect(inventoryFindings(discoverMutatingRoutes(), inventory)).toEqual([]);
    });
  });

  describe("dependency audit", () => {
    const report = JSON.stringify({
      advisories: {
        "1": { id: 1, github_advisory_id: "GHSA-aaaa-aaaa-aaaa", module_name: "left-pad", severity: "high", title: "Bad pad", url: "u" },
        "2": { id: 2, github_advisory_id: "GHSA-bbbb-bbbb-bbbb", module_name: "lodash-es", severity: "moderate", title: "Pollution", url: "u" }
      },
      metadata: {}
    });
    const today = new Date("2026-09-16T12:00:00Z");
    const allow = (id: string, expires: string) => ({ id, package: "lodash-es", reason: "not reachable from input", expires });

    it("parses pnpm audit JSON, keyed by GHSA id", () => {
      expect(parseAudit(report).map((a: Advisory) => `${a.id} ${a.module} ${a.severity}`)).toEqual([
        "GHSA-aaaa-aaaa-aaaa left-pad high",
        "GHSA-bbbb-bbbb-bbbb lodash-es moderate"
      ]);
      expect(parseAudit('{"advisories":{},"metadata":{}}')).toEqual([]);
    });

    it("nightly: fails on an advisory without an allowance and on an expired allowance", () => {
      const result = auditFindings(parseAudit(report), [allow("GHSA-bbbb-bbbb-bbbb", "2026-09-01")], { today });
      expect(result.failures).toEqual([
        "advisory: GHSA-aaaa-aaaa-aaaa left-pad (high): Bad pad",
        "expired-allowance: GHSA-bbbb-bbbb-bbbb (lodash-es) expired 2026-09-01"
      ]);
    });

    it("PR mode: only advisories the change introduces fail; inherited ones and expiries warn", () => {
      const current = parseAudit(report);
      const base = current.filter((a) => a.id === "GHSA-aaaa-aaaa-aaaa");
      const result = auditFindings(current, [allow("GHSA-cccc-cccc-cccc", "2026-09-01")], { today, baseline: base });
      expect(result.failures).toEqual(["advisory: GHSA-bbbb-bbbb-bbbb lodash-es (moderate): Pollution"]);
      expect(result.warnings).toEqual([
        "advisory: GHSA-aaaa-aaaa-aaaa left-pad (high): Bad pad [already on the base branch]",
        "expired-allowance: GHSA-cccc-cccc-cccc (lodash-es) expired 2026-09-01",
        "stale-allowance: GHSA-cccc-cccc-cccc (lodash-es) is no longer reported; delete it"
      ]);
    });

    it("rejects an allowance without a reason or a date", () => {
      const result = auditFindings([], [{ id: "GHSA-x", package: "p", reason: "", expires: "soon" }], { today });
      expect(result.failures).toEqual(["malformed-allowance: GHSA-x needs a reason and an expires date (YYYY-MM-DD)"]);
    });

    it("every committed allowance is well formed", () => {
      const { allowances } = JSON.parse(readText(join(REPO_ROOT, "tests/security/audit-allowlist.json")));
      const result = auditFindings([], allowances, { today: new Date(0) });
      expect(result.failures).toEqual([]);
    });
  });
});
