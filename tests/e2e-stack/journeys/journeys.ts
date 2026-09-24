import { expect, type Page } from "@playwright/test";
import { fixture, stack } from "./stack.ts";

/**
 * The named journeys (runway tier G). Each one drives the UI the way a person
 * would and calls `onPage(pageKey)` after every page settles, so the caller
 * decides what to capture: the specs run axe, the release harness will collect
 * DOM, network and screenshots at the same points.
 *
 * Selectors use roles and accessible names. Native summary controls have no
 * implicit ARIA role in Playwright, so their visible label is used instead.
 */
export type OnPage = (pageKey: string) => Promise<void>;

/** The lab step list: sidebar on desktop, expandable navigation on mobile. */
async function labSteps(page: Page) {
  const sidebar = page.getByRole("list", { name: "Steps", exact: true });
  if (await sidebar.isVisible()) return sidebar;
  const mobile = page.getByRole("navigation", { name: "Steps", exact: true }).getByRole("list");
  if (!(await mobile.isVisible())) await page.getByRole("main").getByText(/^Steps · \d+ \/ \d+$/).click();
  return mobile;
}

/** Anonymous student: home page, open the fixture course, topic, lab, move through steps (math and a diagram on the second), open the Marp talk. */
export async function anonymousStudentReadsCourse(page: Page, onPage: OnPage, courseId: string = stack.courseId) {
  await page.goto(`${stack.reader}/`);
  await expect(page.getByRole("heading", { level: 1, name: /An Open Learning Web Toolkit/ })).toBeVisible();
  await onPage("reader:home");

  await page.goto(`${stack.reader}/course/${courseId}`);
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: fixture.title })).toBeVisible();
  await expect(page).toHaveTitle(fixture.title);
  await onPage("reader:course");

  await page.getByRole("link", { name: new RegExp(`^${fixture.topicTitle}\\b`) }).click();
  await expect(page).toHaveURL(new RegExp(`/topic/${courseId}/${fixture.topicPath}$`));
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: fixture.topicTitle })).toBeVisible();
  await onPage("reader:topic");

  await page.getByRole("main").getByRole("link", { name: new RegExp(`^${fixture.labTitle}\\b`) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/lab/${courseId}/${fixture.labPath}`));
  await expect(page.getByRole("article").getByRole("heading", { level: 1, name: fixture.firstStep.heading })).toBeVisible();
  await expect(await labSteps(page)).toBeVisible();
  await onPage("reader:lab-step");

  // The first step cannot go back, and focused links retain their own arrow keys.
  await page.getByRole("main").focus();
  const firstStepUrl = page.url();
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(firstStepUrl);
  await (await labSteps(page)).getByRole("link", { name: new RegExp(`^(?:01 )?${fixture.firstStep.heading}$`) }).press("ArrowRight");
  await expect(page).toHaveURL(firstStepUrl);

  // Keyboard: the lab advances on ArrowRight when focus is on the reading area.
  await page.getByRole("main").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`/${fixture.labPath}/${fixture.secondStep.id}$`));
  await expect(page.getByRole("article").getByRole("heading", { level: 1, name: fixture.secondStep.heading })).toBeVisible();
  // KaTeX and Mermaid load on demand: the step's math has MathML, and its flowchart became an SVG labelled by its accTitle.
  await expect(page.getByRole("article").getByRole("math")).toHaveCount(1);
  await expect(page.getByRole("article").getByLabel(fixture.secondStepDiagram)).toBeVisible();

  // Pointer: jump back to the first step from the step navigation.
  await (await labSteps(page)).getByRole("link", { name: new RegExp(`^(?:01 )?${fixture.firstStep.heading}$`) }).click();
  await expect(page).toHaveURL(new RegExp(`/${fixture.labPath}/${fixture.firstStep.id}$`));

  // The topic's Marp talk: Marp Core loads on demand and renders the first slide.
  await page.goto(`${stack.reader}/topic/${courseId}/${fixture.topicPath}`);
  await page.getByRole("main").getByRole("link", { name: new RegExp(`^${fixture.talk.title}\\b`) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/talk/${courseId}/${fixture.talk.path}$`));
  await expect(page.getByRole("main").getByRole("heading", { name: fixture.talk.firstSlideHeading })).toBeVisible();
}

/**
 * Anonymous student searches the course: the header opens the search dialog, which lists the matching
 * note as they type, and "Open full search" carries the query to the search page's result cards.
 */
export async function anonymousStudentSearches(page: Page, onPage: OnPage, courseId: string = stack.courseId) {
  await page.goto(`${stack.reader}/course/${courseId}`);
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: fixture.title })).toBeVisible();

  await page.getByRole("button", { name: "Search this course" }).click();
  const dialog = page.getByRole("dialog", { name: "Search this course" });
  const box = dialog.getByRole("combobox", { name: "Enter search term:" });
  await expect(box).toBeFocused();
  await onPage("reader:search");

  await box.fill(fixture.searchTerm);
  await expect(dialog.getByRole("option", { name: new RegExp(fixture.searchResultTitle) }).first()).toBeVisible();
  await dialog.getByRole("link", { name: /Open full search/ }).click();
  await expect(page).toHaveURL(new RegExp(`/search/${courseId}\\?q=`));
  const results = page.getByRole("main").getByRole("link", { name: fixture.searchResultTitle });
  await expect(results.first()).toBeVisible();
  await onPage("reader:search-results");
}

/** The catalogue renders its (empty, anonymous) listing. */
export async function catalogueLoads(page: Page, onPage: OnPage) {
  await page.goto(`${stack.catalogue}/`);
  await expect(page).toHaveTitle(/Tutors Catalogue/);
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Tutors Catalogue" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("0 modules · 0 students");
  await expect(page.getByRole("main")).toContainText("No courses are available to display.");
  await onPage("catalogue:home");
}

/** Live renders its tabs with no presence data in anonymous mode. */
export async function liveLoads(page: Page, onPage: OnPage) {
  await page.goto(`${stack.live}/`);
  await expect(page).toHaveTitle(/Tutors Live/);
  await expect(page.getByRole("tab", { name: /^Courses/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /^Students/ }).click();
  await expect(page.getByRole("tab", { name: /^Students/ })).toHaveAttribute("aria-selected", "true");
  await onPage("live:home");
}
