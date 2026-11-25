import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordPageLoad = vi.fn(async () => undefined);
vi.mock("../../../apps/reader/src/lib/server/api/store.ts", () => ({ recordPageLoad, recordTick: vi.fn(async () => undefined) }));
vi.mock("../../../apps/reader/src/lib/server/api/service-client.ts", () => ({ serviceClient: () => ({}) }));

const { POST } = await import("../../../apps/reader/src/routes/api/analytics/+server.ts");

function pageLoad(day: string) {
  const request = new Request("http://reader.test/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "page-load", courseId: "cs101", loId: "/lab/cs101/lab-1", loType: "lab", day })
  });
  const locals = { actor: { login: "student", name: null, email: null, image: null } };
  return POST({ request, locals } as unknown as Parameters<typeof POST>[0]);
}

async function status(day: string): Promise<number> {
  try {
    return (await pageLoad(day)).status;
  } catch (e) {
    return (e as { status: number }).status;
  }
}

/** The browser's day is checked against the server's clock seam, so a stack frozen at HARNESS_NOW records its page views. */
describe("POST /api/analytics: the day window follows the server clock seam", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T09:00:00Z"));
    recordPageLoad.mockClear();
  });
  afterEach(() => {
    delete process.env.HARNESS_NOW;
    vi.useRealTimers();
  });

  it("accepts the day of HARNESS_NOW when it is set, however far the system clock has moved", async () => {
    process.env.HARNESS_NOW = "2026-09-16T09:05:00.000Z";
    expect(await status("2026-09-16")).toBe(204);
    expect(recordPageLoad).toHaveBeenCalledOnce();
  });

  it("refuses a day more than one away from HARNESS_NOW", async () => {
    process.env.HARNESS_NOW = "2026-09-16T09:05:00.000Z";
    expect(await status("2026-10-28")).toBe(400);
    expect(recordPageLoad).not.toHaveBeenCalled();
  });

  it("checks against the system clock when HARNESS_NOW is unset, so production is unchanged", async () => {
    expect(await status("2026-10-28")).toBe(204);
    expect(await status("2026-09-16")).toBe(400);
  });
});
