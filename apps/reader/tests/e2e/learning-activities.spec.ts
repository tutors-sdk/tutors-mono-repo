import { test, expect, type Page } from "@playwright/test";

// Proves tests/bdd/features/ui/learning-activities.feature: one test per scenario, titled and tagged to match.

const quiz = "/quiz/reference-course/topic-07-reference/quiz-1";
const talk = "/talk/python-fundmentals/topic-03-operators/unit-1/talk-1-operators";
// Cell 2 is a plain code cell, 14 the exercise its author tagged, 15 the solution beside it.
const exerciseNotebook = "/notebook/reference-course/topic-01-typical/unit-1/notebook-a";

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

test("An exercise cell is editable, a plain code cell is not", { tag: "@rule-0230" }, async ({ page }) => {
  await page.goto(exerciseNotebook);
  const plain = page.locator("#notebook-cell-2");
  await expect(plain.getByRole("button", { name: "Show saved output", exact: true })).toBeVisible();
  await expect(plain.getByRole("button", { name: "Run", exact: true })).toHaveCount(0);
  await expect(plain.getByRole("textbox")).toHaveCount(0);

  const exercise = page.locator("#notebook-cell-14");
  await expect(exercise.getByRole("textbox", { name: "python exercise code", exact: true })).toBeVisible();
  await expect(exercise.getByRole("button", { name: "Run", exact: true })).toBeVisible();
  // An exercise carries no saved output of its own: the student's own run is what fills it.
  await expect(exercise.getByRole("button", { name: /Show saved output/ })).toHaveCount(0);
});

test("A solution waits until a student asks for it", { tag: "@rule-0230" }, async ({ page }) => {
  await page.goto(exerciseNotebook);
  const solution = page.locator("#notebook-cell-15");
  await expect(solution).not.toContainText("word[0].upper()");
  // A solution's disclosures carry their open/shut arrow in the label, so it is part of the name.
  await solution.getByRole("button", { name: /Show Solution/ }).click();
  await expect(solution).toContainText("word[0].upper()");
  // The saved output waits behind a second ask, so the answer does not arrive with the code.
  await expect(solution).not.toContainText("G.B.M.H.");
  await solution.getByRole("button", { name: /Show saved output/ }).click();
  await expect(solution).toContainText("G.B.M.H.");
});

test("Running an exercise cell shows what the student's own code printed", { tag: "@rule-0231" }, async ({ page }) => {
  // The first run fetches a Python runtime from a CDN and starts it, which outlasts the default timeout.
  test.slow();
  await page.goto(exerciseNotebook);
  const exercise = page.locator("#notebook-cell-14");
  await exercise.getByRole("button", { name: "Run", exact: true }).click();
  // The exercise is left unfinished, so its two calls print None. The solution beside it has "A.L." saved
  // against the same two calls: seeing None is what tells the code apart from the author's recorded answer.
  const output = exercise.getByRole("status", { name: "Python output", exact: true });
  await expect(output).toContainText("None\nNone", { timeout: 90_000 });
  await expect(output).not.toContainText("A.L.");
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
