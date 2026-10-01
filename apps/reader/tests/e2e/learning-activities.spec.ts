import { test, expect, type Locator, type Page } from "@playwright/test";
import { openNotebookWithoutHeadings } from "./support";

// Proves tests/bdd/features/ui/learning-activities.feature: one test per scenario, titled and tagged to match.

const quiz = "/quiz/reference-course/topic-07-reference/quiz-1";
const talk = "/talk/python-fundmentals/topic-03-operators/unit-1/talk-1-operators";
const notebook = "/notebook/python-fundmentals/topic-03-operators/unit-1/notebook-operators";

/** The outline lives in the sidebar, which the shell only lays out from 1024px up. */
function outlineOf(page: Page): Locator {
  return page.locator(".shell-navigation").getByRole("list", { name: "Outline", exact: true });
}

async function openNotebookWide(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(notebook);
  await page.locator("#notebook-cell-0").waitFor();
  return outlineOf(page);
}

async function openDeckOnSlideTwo(page: Page) {
  await page.goto(talk);
  const slides = page.getByRole("region", { name: "Operators in Python", exact: true });
  await expect(slides).toContainText("1 of 11");
  await expect(slides.getByRole("button", { name: "Back 1 slide", exact: true })).toBeDisabled();
  await slides.getByRole("button", { name: "Forward 1 slide", exact: true }).click();
  await expect(slides).toContainText("2 of 11");
  return slides;
}

test("Quiz answers survive question navigation", { tag: "@rule-0047" }, async ({ page }) => {
  await page.goto(quiz);
  const firstAnswer = page.getByRole("radio").first();
  await firstAnswer.check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(firstAnswer).toBeChecked();
  // Declining the leave prompt keeps the student, and their answers, on the quiz.
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator(".shell-navigation").getByRole("link", { name: "Course home", exact: true }).click();
  await expect(page).toHaveURL(/\/quiz\//);
  await expect(firstAnswer).toBeChecked();
});

test("Retaking a quiz starts again", { tag: "@rule-0048" }, async ({ page }) => {
  await page.goto(quiz);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("heading", { name: /— Results$/ })).toBeFocused();
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("radio").first()).not.toBeChecked();
});

test("Notebook shows the current cell", { tag: "@rule-0049" }, async ({ page }) => {
  await page.goto("/notebook/python-fundmentals/topic-03-operators/unit-1/notebook-operators");
  const navigation = page.getByRole("navigation", { name: "Notebook cell navigation", exact: true });
  await expect(navigation).toContainText("Cell 1 of 19");
  await navigation.getByRole("button", { name: "Next cell", exact: true }).click();
  await expect(navigation).toContainText("Cell 2 of 19");
  await page.getByRole("button", { name: "Show saved output", exact: true }).first().click();
  await expect(page.getByRole("button", { name: /Hide output/i }).first()).toBeVisible();
});

test("Notebook headings fill the course navigation", { tag: "@rule-0232" }, async ({ page }) => {
  const outline = await openNotebookWide(page);
  await expect(outline.getByRole("link")).toHaveText([
    "01Operator Playground",
    "02Arithmetic Operators",
    "03Comparison Operators",
    "04Logical Operators and Short-Circuit Evaluation",
    "05Assignment Operators and the Walrus Operator",
    "06String Operations",
    "07Operator Precedence Puzzles",
    "08Exercise: Expression Evaluator",
    "09Exercise: Time Converter"
  ]);
  // "# SOLUTION" and "# Puzzle 1: ..." head code cells: they are Python comments, not headings.
  await expect(outline.getByRole("link", { name: /SOLUTION|Puzzle 1/i })).toHaveCount(0);
});

test("A notebook without headings falls back to its cells", { tag: "@rule-0232" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openNotebookWithoutHeadings(page, notebook);
  await expect(outlineOf(page).getByRole("link")).toHaveCount(19);
});

test("Notebook outline follows the reader", { tag: "@rule-0233" }, async ({ page }) => {
  // Reduced motion makes the scroll to a cell, and so the rect the observer reads, immediate.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const outline = await openNotebookWide(page);
  const marked = outline.locator('[aria-current="step"]');
  // The number is part of each entry's accessible name, as it is for a lab step.
  await outline.getByRole("link", { name: "03 Comparison Operators", exact: true }).click();
  // The third entry heads cell 3, not cell 2: code cells sit between the headings.
  await expect(page.locator("#notebook-cell-3")).toBeInViewport();
  await expect(marked).toHaveText("03Comparison Operators");
  await page.locator("#notebook-cell-5").evaluate(cell => cell.scrollIntoView({ block: "start" }));
  await expect(marked).toHaveText("04Logical Operators and Short-Circuit Evaluation");
});

test("Notebook outline and pager stay in sync on phones", { tag: "@rule-0233" }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(notebook);
  await page.locator("#notebook-cell-0").waitFor();
  await page.getByRole("button", { name: "Course navigation", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "03 Comparison Operators", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("#notebook-cell-3")).toBeInViewport();
  const pager = page.getByRole("navigation", { name: "Notebook cell navigation", exact: true });
  await expect(pager).toContainText("Cell 4 of 19");
  await pager.getByRole("button", { name: "Next cell", exact: true }).click();
  await expect(pager).toContainText("Cell 5 of 19");
  await expect(page.locator("#notebook-cell-4")).toBeFocused();
  // Returning to the same fragment must select its cell again, too.
  // Scroll up to reveal the phone header before opening navigation again.
  await page.locator(".shell-main").evaluate(main => main.scrollBy({ top: -100 }));
  await expect(page.getByRole("button", { name: "Course navigation", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Course navigation", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "03 Comparison Operators", exact: true }).click();
  await expect(pager).toContainText("Cell 4 of 19");
});

test("Arrow keys move a focused slide deck", { tag: "@rule-0050" }, async ({ page }) => {
  const slides = await openDeckOnSlideTwo(page);
  await slides.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slides).toContainText("3 of 11");
});

test("Arrow keys leave an unfocused slide deck alone", { tag: "@rule-0050" }, async ({ page }) => {
  const slides = await openDeckOnSlideTwo(page);
  await page.locator("#main-content").focus();
  await page.keyboard.press("ArrowRight");
  await expect(slides).toContainText("2 of 11");
});
