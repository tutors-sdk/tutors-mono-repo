import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, request, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * The signed-in half of the E2E stack (tests/e2e-stack/compose.yaml) and what the signed-in and resilience
 * journeys need from it: a browser that signs in through the identity stub, and the persistence stub's control
 * routes (reset, the writes it recorded, seeds, Realtime relay, faults). Defaults match compose.yaml; the URLs
 * can be overridden, as the anonymous journeys' can (stack.ts).
 */
export const signedIn = {
  reader: process.env.READER_SIGNED_IN_URL ?? "http://localhost:3100",
  live: process.env.LIVE_SIGNED_IN_URL ?? "http://localhost:3102",
  time: process.env.TIME_SIGNED_IN_URL ?? "http://localhost:3104",
  /** The identity stub as the test runner reaches it (its certificate is the stack's test CA, so HTTPS errors are ignored). */
  identity: process.env.IDENTITY_URL ?? "https://localhost:8443",
  /** The persistence stub as the test runner reaches it; the apps and the browser call it persistence.e2e.test:8090. */
  persistence: process.env.PERSISTENCE_URL ?? "http://localhost:8090",
  /** The public fixture course (stack.ts `fixture`) and the signed-in course (fixture-course/build-signed-in.ts). */
  publicCourseId: "harness-public",
  courseId: "harness-rules",
  /** A course whose host accepts the request for tutors.json and never answers (course-stalled). */
  stalledCourseId: process.env.STALLED_COURSE_ID ?? "localhost:8083"
};

/** The signed-in course built by fixture-course/build-signed-in.ts. Change both together. */
export const signedInCourse = {
  title: "Harness Rules Course",
  /** The id the time dashboard knows the course by: it reads the PIN from https://<id>.netlify.app/tutors.json. */
  timeId: "harness-rules",
  pin: "4321"
};

/** The identity stub's people (fixtures/identity/stub.mjs): the course lists `enrolled`, and `lecturer` as an educator. */
export type Role = "student" | "enrolled" | "lecturer";
export const people: Record<Role, { login: string; name: string }> = {
  student: { login: "harness-student", name: "Harness Student" },
  enrolled: { login: "harness-enrolled", name: "Harness Enrolled Student" },
  lecturer: { login: "harness-lecturer", name: "Harness Lecturer" }
};

export const VISIBLE = { timeout: 15_000 };

/**
 * A browser context whose GitHub OAuth hops go to the identity stub, signing in as `role` (GitHub's own `login_hint`,
 * which the stub reads), and whose requests for the signed-in course by its Netlify name (the time dashboard's PIN, and
 * the reader opening it as `harness-rules`, which the educator-checked routes need) are answered by the course server.
 */
export async function contextFor(browser: Browser, role: Role): Promise<BrowserContext> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, timezoneId: "Europe/Dublin", locale: "en-IE" });
  await context.route(/^https:\/\/(api\.)?github\.com\//, async (route) => {
    const original = new URL(route.request().url());
    if (original.pathname === "/login/oauth/authorize") original.searchParams.set("login_hint", role);
    await route.fulfill({ response: await route.fetch({ url: `${signedIn.identity}${original.pathname}${original.search}`, maxRedirects: 0 }) });
  });
  for (const [id, origin] of [
    [signedIn.publicCourseId, process.env.COURSE_ID ?? "localhost:8080"],
    [signedIn.courseId, process.env.SIGNED_IN_COURSE_ID ?? "localhost:8082"]
  ]) {
    await context.route(`https://${id}.netlify.app/**`, async (route) => {
      const original = new URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: `http://${origin}${original.pathname}${original.search}` }) });
    });
  }
  return context;
}

/**
 * Better Auth refuses a fourth sign-in from one client within 10 seconds of the third (its limiter on the sign-in
 * paths: 3 per 10 s, counted again only after a quiet 10 s). The journeys sign in from one runner, so they pace
 * themselves under it, as the release harness does; the project runs them one at a time (playwright.e2e-stack.config.ts).
 */
const LIMIT = { max: 3, quietMs: 11_500 };
let paced = { count: 0, last: -Infinity };
async function paceSignIn(page: Page) {
  if (Date.now() - paced.last > LIMIT.quietMs) paced = { count: 0, last: paced.last };
  if (paced.count >= LIMIT.max - 1) {
    await page.waitForTimeout(Math.max(0, paced.last + LIMIT.quietMs - Date.now()));
    paced = { count: 0, last: paced.last };
  }
  paced.count++;
}

/** From the reader's sign-in page for `courseId`, sign in with GitHub (the identity stub). */
export async function startSignIn(page: Page, courseId: string): Promise<void> {
  await page.goto(`${signedIn.reader}/auth/${courseId}`);
  const button = page.getByRole("button", { name: "Sign in with GitHub" });
  await expect(button).toBeVisible(VISIBLE);
  await paceSignIn(page);
  await button.click();
}

/** Sign in from a course and wait until the reader has brought the student back to it, signed in. */
export async function signInToCourse(page: Page, courseId: string, title: string): Promise<void> {
  // The reader reconnects the student in the background once the course renders, ending with their online status:
  // waiting for that read keeps the next step from racing the reconnect's own navigation. The reconnect reads GET
  // /api/me twice, the sentiment and then the online status (connect.svelte.ts), so the second read is the one.
  let meReads = 0;
  const reconnected = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/me" && r.request().method() === "GET" && ++meReads === 2, { timeout: 30_000 });
  reconnected.catch(() => undefined);
  await startSignIn(page, courseId);
  await page.waitForURL(new RegExp(`/course/${escapeRegExp(courseId)}`), { timeout: 30_000 });
  paced.last = Date.now();
  await expect(page.getByRole("banner").getByRole("heading", { name: title })).toBeVisible(VISIBLE);
  await reconnected;
}

/** The lab's step navigation at this viewport (the "Course navigation" sidebar's list of steps). */
export function labSteps(page: Page) {
  return page.getByRole("complementary", { name: "Course navigation" }).getByRole("list", { name: "Steps" }).filter({ visible: true }).first();
}

/** The open lab step's level-1 heading. */
export function labStepHeading(page: Page, heading: string) {
  return page.getByRole("article").getByRole("heading", { level: 1, name: heading });
}

/** Open a card on the page by the start of its link name: a topic, a lab, a quiz. */
export async function openCard(page: Page, title: string): Promise<void> {
  await page.getByRole("main").getByRole("link", { name: new RegExp(`^${escapeRegExp(title)}\\b`) }).first().click();
}

/** Back to a topic by its link in the breadcrumbs, as a student returns from a talk or a notebook. */
export async function backToTopic(page: Page, title: string): Promise<void> {
  await page.getByRole("navigation", { name: "Breadcrumbs" }).getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: title }).first()).toBeVisible(VISIBLE);
}

/** Escape until no dialog is open. */
export async function closeEveryDialog(page: Page): Promise<void> {
  for (let i = 0; i < 5 && (await page.getByRole("dialog").count()) > 0; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/**
 * One freehand stroke across the middle of a whiteboard's canvas, with Excalidraw's Draw tool: a stroke is drawn the
 * same from the same points, where a shape is drawn rough with a random seed. The tool's radio is visually hidden
 * under its icon, so it is checked by force. The editor loads Excalidraw from esm.sh.
 */
export async function drawStroke(page: Page, title: string): Promise<void> {
  const frame = page.frameLocator(`iframe[title="${title}"]`);
  const draw = frame.getByRole("radio", { name: /^Draw/ }).first();
  await draw.waitFor({ state: "attached", timeout: 30_000 });
  await draw.check({ force: true });
  const box = await page.locator(`iframe[title="${title}"]`).boundingBox();
  if (!box) throw new Error(`the whiteboard "${title}" has no box on the page`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x - 100, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x - 100 + i * 20, y + (i % 2 ? 10 : -10));
  await page.mouse.up();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- the persistence stub --------------------------------------------------------------------------------------

export interface Write {
  seq: number;
  kind: "write" | "rpc";
  method: string;
  table: string;
  rows?: number;
}

async function stub(path: string, body?: unknown): Promise<Response> {
  const response = await fetch(`${signedIn.persistence}${path}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response;
}

export const persistence = {
  /** Forget every write, kept row, seed, relay and fault. Each journey starts here. */
  reset: () => stub("/_harness/reset", {}),
  writes: async (): Promise<Write[]> => (await stub("/_harness/writes")).json(),
  /** Until the next reset, Realtime broadcasts reach the other browsers joined to their topic. */
  relay: () => stub("/_harness/relay", {}),
  /** Rows the next reads see, from fixtures/persistence/seeds/<name>.json. */
  seed: (name: string) => {
    const rows = JSON.parse(readFileSync(resolve(__dirname, `../fixtures/persistence/seeds/${name}.json`), "utf8")) as Record<string, unknown>;
    return stub("/_harness/seed", Object.fromEntries(Object.entries(rows).filter(([table]) => !table.startsWith("_"))));
  },
  /** Until the next reset, the data API answers 503 (down) or never answers (hang). */
  fault: (mode: "down" | "hang" | "off") => stub("/_harness/fault", { mode })
};

/** GitHub as the reader's server sees it: "down" fails the token exchange and the profile with 503. */
export async function identityFault(mode: "down" | "off"): Promise<void> {
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const response = await api.post(`${signedIn.identity}/_harness/fault`, { data: { mode } });
    if (!response.ok()) throw new Error(`identity fault ${mode} -> ${response.status()}`);
  } finally {
    await api.dispose();
  }
}

/** The tables and RPCs written since the last reset, as `POST tutors-connect-users` / `rpc record_page_view`. */
export const written = (writes: Write[]) => writes.map((w) => (w.kind === "rpc" ? `rpc ${w.table}` : `${w.method} ${w.table}`));
