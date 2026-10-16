import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { lab } from "./support";

// Proves tests/bdd/features/ui/lab-notes.feature: one test per scenario, titled and tagged to match.

const notesButton = (page: Page) => page.getByRole("button", { name: /^Notes/ });
const noteBox = (page: Page) => page.getByRole("textbox", { name: "Note for this step", exact: true });
const panel = (page: Page) => page.getByRole("complementary", { name: "My notes", exact: true });
const minimised = (page: Page) => page.getByRole("region", { name: "My notes", exact: true });
/** The lab's steps in the sidebar, which the shell lays out from 1024px up. */
const stepList = (page: Page) => page.locator(".shell-navigation").getByRole("list", { name: "Steps", exact: true });
const dot = "This step has a note";

async function openLab(page: Page, width = 1440, height = 1000) {
  await page.setViewportSize({ width, height });
  await page.goto(lab);
  await expect(notesButton(page)).toBeVisible();
}

async function openNotes(page: Page) {
  await notesButton(page).click();
  await expect(noteBox(page)).toBeVisible();
}

/** Types a note and waits for the panel to say it is kept (Rule 0380: within a second). */
async function writeNote(page: Page, text: string) {
  await noteBox(page).fill(text);
  await expect(panel(page).getByText("Saved in this browser", { exact: true })).toBeVisible({ timeout: 2_000 });
}

async function nextStep(page: Page) {
  const before = page.url();
  await page.locator(".step-pager .next").click();
  await expect(page).not.toHaveURL(before);
}

const storedNotes = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("@notes/") && k !== "@notes/panel"));

test("The notes panel opens beside the step", { tag: "@rule-0554" }, async ({ page }) => {
  await openLab(page);
  await openNotes(page);
  await expect(noteBox(page)).toBeFocused();
  const step = (await page.locator(".lab-content .reading-panel").boundingBox())!;
  const notes = (await panel(page).boundingBox())!;
  expect(notes.x).toBeGreaterThanOrEqual(step.x + step.width);
  expect(notes.y).toBeLessThan(step.y + step.height);
});

test("The notes panel is a sheet along the bottom of a phone", { tag: "@rule-0554" }, async ({ page }) => {
  await openLab(page, 390, 844);
  await openNotes(page);
  const notes = (await panel(page).boundingBox())!;
  expect(Math.round(notes.x)).toBe(0);
  expect(Math.round(notes.width)).toBe(390);
  expect(Math.round(notes.y + notes.height)).toBe(844);
});

test("A step with a note is marked", { tag: "@rule-0555" }, async ({ page }) => {
  await openLab(page);
  await openNotes(page);
  await writeNote(page, "The first step needs Node 22");
  await expect(stepList(page).getByRole("listitem").first().getByRole("img", { name: dot })).toBeVisible();
  await expect(notesButton(page).getByRole("img", { name: dot })).toBeVisible();
});

test("A step without a note is not marked", { tag: "@rule-0555" }, async ({ page }) => {
  await openLab(page);
  await openNotes(page);
  await writeNote(page, "The first step needs Node 22");
  await nextStep(page);
  await expect(noteBox(page)).toHaveValue("");
  await expect(notesButton(page).getByRole("img", { name: dot })).toHaveCount(0);
  await expect(stepList(page).getByRole("img", { name: dot })).toHaveCount(1);
  await expect(stepList(page).getByRole("listitem").first().getByRole("img", { name: dot })).toBeVisible();
});

test("The open panel follows the student to the next step", { tag: "@rule-0556" }, async ({ page }) => {
  await openLab(page);
  await openNotes(page);
  await writeNote(page, "first step thoughts");
  await nextStep(page);
  await expect(panel(page)).toBeVisible();
  await expect(noteBox(page)).toHaveValue("");
  await page.goBack();
  await expect(noteBox(page)).toHaveValue("first step thoughts");
});

test("A minimised panel stays minimised", { tag: "@rule-0556" }, async ({ page }) => {
  await openLab(page);
  await openNotes(page);
  await panel(page).getByRole("button", { name: "Minimise", exact: true }).click();
  await expect(minimised(page)).toBeVisible();
  await nextStep(page);
  await expect(minimised(page)).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await minimised(page).getByRole("button", { name: "Open notes", exact: true }).click();
  await expect(noteBox(page)).toBeVisible();
});

test("Arrow keys in a note move the cursor, not the step", { tag: "@rule-0556" }, async ({ page }) => {
  await openLab(page);
  await openNotes(page);
  await noteBox(page).fill("abc");
  const here = page.url();
  await noteBox(page).press("ArrowLeft");
  await noteBox(page).press("ArrowRight");
  await page.waitForTimeout(500);
  expect(page.url()).toBe(here);
});

test("Exporting downloads the course's notes as markdown", { tag: "@rule-0557" }, async ({ page }) => {
  const posted: string[] = [];
  page.on("request", (request) => {
    const body = request.postData();
    if (body) posted.push(body);
  });
  await openLab(page);
  await openNotes(page);
  await writeNote(page, "first step thoughts");
  await nextStep(page);
  await writeNote(page, "second step thoughts");
  const download = page.waitForEvent("download");
  await panel(page).getByRole("button", { name: "Export course notes", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("reference-course-notes.md");
  const markdown = await readFile(await file.path(), "utf8");
  expect(markdown).toMatch(/^# .+ notes\n/);
  expect(markdown.match(/^## /gm)).toHaveLength(1);
  expect(markdown).toContain("first step thoughts");
  expect(markdown).toContain("second step thoughts");
  test.info().annotations.push({ type: "posted", description: String(posted.length) });
  expect(posted.filter((body) => body.includes("step thoughts"))).toEqual([]);
});

test("Deleting all notes asks first and keeps other courses' notes", { tag: "@rule-0558" }, async ({ page }) => {
  await openLab(page);
  const other = "@notes/other-course/lab/other-course/book/01";
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ ref: { courseId: "other-course", labRoute: "/lab/other-course/book", stepId: "01" }, body: "keep me", kind: "note", updatedAt: "2026-01-05T09:00:00.000Z" })), other);
  await openNotes(page);
  await writeNote(page, "delete me");
  await panel(page).getByRole("button", { name: "Delete all notes for this course", exact: true }).click();
  await panel(page).getByRole("button", { name: "Delete all", exact: true }).click();
  await expect(noteBox(page)).toHaveValue("");
  await expect.poll(() => storedNotes(page)).toEqual([other]);
});
