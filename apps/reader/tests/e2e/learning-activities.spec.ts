import { test, expect, type Page } from "@playwright/test";

// Proves tests/bdd/features/ui/learning-activities.feature: one test per scenario, titled and tagged to match.

const quiz = "/quiz/reference-course/topic-07-reference/quiz-1";
const talk = "/talk/python-fundmentals/topic-03-operators/unit-1/talk-1-operators";

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
