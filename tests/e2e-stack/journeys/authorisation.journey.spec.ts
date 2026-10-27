import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { ROLES, cellFindings, parseGaps, parseMatrix, splitKey, type Observation, type Role } from "../../../scripts/checks/authorisation.ts";
import { fixture, stack } from "./stack.ts";
import { contextFor, persistence, signInToCourse, signedIn } from "./signed-in.ts";

/**
 * The authorisation journey: tests/bdd/features/journeys/authorisation.feature. Every endpoint in
 * tests/e2e-stack/authorisation/matrix.json is asked as every role, against the built images, and each answer is held
 * to the matrix; a cell known-gaps.txt explains passes until it changes, and then its line must go.
 */
const read = (name: string) => readFileSync(resolve(__dirname, "../authorisation", name), "utf8");
const matrix = parseMatrix(read("matrix.json"));
const gaps = parseGaps(read("known-gaps.txt"));

/** The catalogue runs only in the anonymous half of the stack; the other apps are asked where sign-in works. */
const base: Record<string, string> = { catalogue: stack.catalogue, reader: signedIn.reader, live: signedIn.live, time: signedIn.time };
const OPERATOR = { authorization: "Bearer e2e-metrics-token" };

async function ask(request: APIRequestContext, role: Role): Promise<Observation[]> {
  const observations: Observation[] = [];
  for (const entry of matrix.entries) {
    const { app, method } = splitKey(entry.key);
    const response = await request.fetch(`${base[app]}${entry.request.path}`, {
      method,
      headers: role === "operator" ? OPERATOR : undefined,
      data: entry.key === "reader POST /api/analytics"
        ? { ...entry.request.body as object, day: new Date().toISOString().slice(0, 10) }
        : entry.request.body,
      maxRedirects: 0,
      timeout: 15_000
    });
    observations.push({ key: entry.key, role, status: response.status() });
  }
  return observations;
}

test.beforeEach(async () => {
  await persistence.reset();
});

test("Every server route answers each role with the status the matrix commits to", { tag: "@rule-0621" }, async ({ browser, playwright }) => {
  const observations: Observation[] = [];
  for (const role of ROLES) {
    if (role === "anonymous" || role === "operator") {
      const request = await playwright.request.newContext();
      observations.push(...(await ask(request, role)));
      await request.dispose();
      continue;
    }
    const context = await contextFor(browser, role);
    const page = await context.newPage();
    await signInToCourse(page, signedIn.publicCourseId, fixture.title);
    observations.push(...(await ask(context.request, role)));
    await context.close();
  }
  const table = observations.map((o) => `${o.key} | ${o.role} | ${o.status}`).join("\n");
  await test.info().attach("authorisation-matrix.txt", { body: table, contentType: "text/plain" });
  expect(cellFindings(observations, matrix, gaps), table).toEqual([]);
});
