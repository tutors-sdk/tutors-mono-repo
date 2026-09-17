import { expect, test } from "@playwright/test";

/**
 * The live app against a running server.
 *
 * With no `LIVE_*` configuration the app runs the whole pipeline in memory, so
 * these tests post events and then read them back through the same API the
 * dashboard uses - which is the end-to-end path, not a mock of it.
 */

test.describe("Live App Smoke Tests", () => {
  test("homepage loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("the dashboard renders its panels", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Tutors Live", level: 1 })).toBeVisible();
    await expect(page.getByRole("group", { name: "Time range" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active now" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Top courses" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Observations" })).toBeVisible();
    await expect(page.getByText("Anonymous by design.")).toBeVisible();
  });

  test("the range switch asks the API for the range it shows", async ({ page }) => {
    await page.goto("/");

    const request = page.waitForRequest((candidate) => candidate.url().includes("/api/live/stats?range=30d"));
    await page.getByRole("button", { name: "30 days" }).click();
    await request;

    await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a posted event reaches the presence view", async ({ page, request }) => {
    const sid = `e2e-${Date.now()}`;
    const course = `e2e-course-${Date.now()}`;
    const ts = new Date().toISOString();

    const accepted = await request.post("/api/live/events", {
      data: [
        { type: "session.started", ts, sid, course },
        { type: "lo.viewed", ts, sid, course, lo: "/topic/1/lab-1", loType: "lab" },
        { type: "service.used", ts, sid, course, service: "lab" }
      ]
    });
    expect(accepted.status()).toBe(202);
    expect(await accepted.json()).toEqual({ accepted: 3, rejected: 0 });

    const now = await (await request.get("/api/live/now")).json();
    expect(now.courses.map((entry: { course: string }) => entry.course)).toContain(course);

    await page.goto("/");
    await expect(page.getByRole("link", { name: course })).toBeVisible();
  });

  test("the ingest endpoint refuses a batch it cannot believe", async ({ request }) => {
    const rejected = await request.post("/api/live/events", { data: [{ type: "session.hijacked" }] });
    expect(rejected.status()).toBe(400);

    const notJson = await request.post("/api/live/events", {
      data: "<html>nope</html>",
      headers: { "content-type": "application/json" }
    });
    expect(notJson.status()).toBe(400);
  });

  test("the read API answers every documented shape", async ({ request }) => {
    const stats = await (await request.get("/api/live/stats?range=7d")).json();
    expect(stats).toMatchObject({ range: "7d", course: null });
    expect(Array.isArray(stats.series)).toBe(true);
    expect(stats.serviceMix).toHaveLength(12);

    const heatmap = await (await request.get("/api/live/heatmap?kind=service&range=7d")).json();
    expect(heatmap.y).toHaveLength(7);
    expect(heatmap.x).toHaveLength(24);
    expect(heatmap.cells).toHaveLength(7);

    const observations = await (await request.get("/api/live/observations?range=7d")).json();
    expect(Array.isArray(observations.observations)).toBe(true);

    expect((await request.get("/api/live/heatmap?kind=weather&range=7d")).status()).toBe(400);
    expect((await request.get("/api/live/stats?range=forever")).status()).toBe(400);
  });
});
