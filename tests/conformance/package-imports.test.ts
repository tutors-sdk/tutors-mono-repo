import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { workspaceAliases } from "../../vitest.aliases.ts";
import { AssignmentsService } from "../../apps/time/src/lib/server/services/AssignmentsService.ts";

vi.mock("$env/dynamic/private", () => ({ env: {} }));

describe("package-local app imports", () => {
  it("resolves from the importing app without a root #lib alias", () => {
    const reader = createRequire(join(REPO_ROOT, "apps/reader/package.json"));
    const time = createRequire(join(REPO_ROOT, "apps/time/package.json"));
    expect(reader.resolve("#lib/server/auth-mode.ts")).toBe(join(REPO_ROOT, "apps/reader/src/lib/server/auth-mode.ts"));
    expect(time.resolve("#lib/server/api/moodle.ts")).toBe(join(REPO_ROOT, "apps/time/src/lib/server/api/moodle.ts"));
    expect(() => reader.resolve("#lib/server/api/moodle.ts")).toThrow();
    expect(() => time.resolve("#lib/server/auth-mode.ts")).toThrow();
    expect(Object.keys(workspaceAliases).some((name) => name.startsWith("#lib"))).toBe(false);
  });

  it("loads time's own #lib dependencies through the root test runner", async () => {
    expect(await new AssignmentsService().fetchSubmissions([])).toEqual({ assignments: [], warnings: [] });
  });
});
