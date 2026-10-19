import { expect, test } from "@playwright/test";
import { fixture } from "./stack.ts";
import {
  VISIBLE,
  backToTopic,
  closeEveryDialog,
  contextFor,
  drawStroke,
  labStepHeading,
  labSteps,
  openCard,
  people,
  persistence,
  signInToCourse,
  signedIn,
  signedInCourse,
  startSignIn,
  written
} from "./signed-in.ts";

/**
 * The signed-in journeys: tests/bdd/features/journeys/signed-in.feature, one test per scenario, titled with the
 * scenario and tagged with its Rule id (`pnpm test:ears:audit` checks both ways). They run in the `signed-in`
 * project, one at a time, because they share the stack's one persistence stub; each starts from a reset stub.
 */
test.beforeEach(async () => {
  await persistence.reset();
});

test("A student signs in and is returned to the course (exercises Rules 0011, 0250, 0260)", { tag: "@rule-0606" }, async ({ browser }) => {
  const context = await contextFor(browser, "student");
  const page = await context.newPage();
  await signInToCourse(page, signedIn.publicCourseId, fixture.title);
  await expect(page.getByRole("button", { name: "Profile menu" })).toBeVisible(VISIBLE);
  await expect.poll(async () => written(await persistence.writes()), VISIBLE).toEqual(expect.arrayContaining(["POST tutors-connect-users", "POST tutors-connect-courses", "rpc record_page_view"]));
  await context.close();
});

test("A signed-in student moves through a lab and each step is recorded (exercises Rules 0303, 0330)", { tag: "@rule-0607" }, async ({ browser }) => {
  const context = await contextFor(browser, "student");
  const page = await context.newPage();
  await signInToCourse(page, signedIn.publicCourseId, fixture.title);
  await persistence.reset();
  await page.goto(`${signedIn.reader}/lab/${signedIn.publicCourseId}/${fixture.labPath}`);
  await expect(labStepHeading(page, fixture.firstStep.heading)).toBeVisible(VISIBLE);
  await labSteps(page).getByRole("link", { name: new RegExp(`^(?:\\d+\\s+)?${fixture.secondStep.heading}$`) }).click();
  await expect(labStepHeading(page, fixture.secondStep.heading)).toBeVisible(VISIBLE);
  const pageViews = async () => written(await persistence.writes()).filter((w) => w === "rpc record_page_view").length;
  await expect.poll(pageViews, VISIBLE).toBe(2);
  await context.close();
});

test("A student the private course does not list is turned away (exercises Rules 0011, 0267)", { tag: "@rule-0608" }, async ({ browser }) => {
  const context = await contextFor(browser, "student");
  const page = await context.newPage();
  await startSignIn(page, signedIn.courseId);
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
  await expect(page.getByRole("main").getByRole("heading", { name: "Welcome to Tutors" })).toBeVisible(VISIBLE);
  await page.goto(`${signedIn.reader}/course/${signedIn.courseId}`);
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: signedInCourse.title })).toHaveCount(0);
  await context.close();
});

test("A student's appearance and theme survive a reload (exercises Rules 0037, 0038, 0039)", { tag: "@rule-0609" }, async ({ browser }) => {
  const context = await contextFor(browser, "enrolled");
  const page = await context.newPage();
  await signInToCourse(page, signedIn.courseId, signedInCourse.title);
  const preferences = page.getByRole("dialog", { name: "Preferences", exact: true });
  await page.getByRole("button", { name: "Preferences", exact: true }).filter({ visible: true }).first().click();
  await expect(preferences).toBeVisible(VISIBLE);
  await preferences.getByRole("button", { name: "Dark", exact: true }).click();
  await preferences.getByRole("combobox", { name: "Theme", exact: true }).selectOption({ label: "Dyslexia" });
  await expect(preferences.getByRole("button", { name: "Dark", exact: true, pressed: true })).toBeVisible(VISIBLE);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Preferences", exact: true }).filter({ visible: true }).first().click();
  await expect(preferences.getByRole("button", { name: "Dark", exact: true, pressed: true })).toBeVisible(VISIBLE);
  await expect(preferences.getByRole("combobox", { name: "Theme", exact: true }).getByRole("option", { name: "Dyslexia", selected: true })).toBeAttached();
  await context.close();
});

test("An enrolled student submits a quiz and sees their score (exercises Rules 0047, 0050)", { tag: "@rule-0610" }, async ({ browser }) => {
  const context = await contextFor(browser, "enrolled");
  const page = await context.newPage();
  await signInToCourse(page, signedIn.courseId, signedInCourse.title);
  await openCard(page, "Topic 1");
  await openCard(page, "Quiz 1");
  await page.waitForURL(/\/quiz\//, VISIBLE);
  await page.getByRole("group", { name: "1. Which keyword declares a constant?", exact: true }).getByRole("radio", { name: "const", exact: true }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("group", { name: "2. A lab step can hold code.", exact: true }).getByRole("radio", { name: "True", exact: true }).check();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "You answered 2 of 2 questions correctly. 100%." })).toBeAttached(VISIBLE);
  await context.close();
});

test("A lecturer locks a topic and the enrolled student no longer sees it (exercises Rules 0052, 0053, 0630)", { tag: "@rule-0611" }, async ({ browser }) => {
  // The lock goes through the reader's educator check, which reads the enrollment from Netlify by the course's name.
  await persistence.reset();
  const lecturer = await (await contextFor(browser, "lecturer")).newPage();
  await signInToCourse(lecturer, signedInCourse.timeId, signedInCourse.title);
  await lecturer.getByRole("button", { name: "Open Educator Control", exact: true }).filter({ visible: true }).first().click();
  await expect(lecturer.getByRole("dialog", { name: "Educator Control" })).toBeVisible(VISIBLE);
  const lock = lecturer.getByRole("switch", { name: "Lock Topic 2", exact: true }).or(lecturer.getByRole("checkbox", { name: "Lock Topic 2", exact: true })).first();
  // Skeleton's switch is a visually hidden checkbox inside its label: click it as the label would.
  await lock.evaluate((input: HTMLInputElement) => input.click());
  await expect(lock).toBeChecked();
  await expect.poll(async () => written(await persistence.writes()), VISIBLE).toContain("POST tutors_content_locks");
  await lecturer.keyboard.press("Escape");
  await expect(lecturer.getByRole("button", { name: "Unlock Topic 2", exact: true }).filter({ visible: true }).first()).toBeVisible(VISIBLE);

  const student = await (await contextFor(browser, "enrolled")).newPage();
  await signInToCourse(student, signedInCourse.timeId, signedInCourse.title);
  await expect(student.getByRole("main").getByRole("heading", { name: "Topic 1", exact: true })).toBeVisible(VISIBLE);
  await expect(student.getByRole("main").getByRole("heading", { name: "Topic 2", exact: true })).toHaveCount(0);
  await lecturer.context().close();
  await student.context().close();
});

test("A student who shares presence appears in Tutors Live (exercises Rules 0330, 0335)", { tag: "@rule-0612" }, async ({ browser }) => {
  await persistence.relay();
  const student = await (await contextFor(browser, "student")).newPage();
  await signInToCourse(student, signedIn.publicCourseId, fixture.title);
  await student.goto(`${signedIn.reader}/lab/${signedIn.publicCourseId}/${fixture.labPath}`);
  await expect(labStepHeading(student, fixture.firstStep.heading)).toBeVisible(VISIBLE);

  const live = await (await contextFor(browser, "lecturer")).newPage();
  await live.goto(`${signedIn.live}/`);
  await expect(live.getByRole("heading", { level: 1, name: "Tutors Live" })).toBeVisible(VISIBLE);
  // Live hears a student when they next open a page; a person on a lab moves on, so the student reloads it.
  await student.reload();
  await expect(labStepHeading(student, fixture.firstStep.heading)).toBeVisible(VISIBLE);
  await expect(live.getByRole("tab", { name: "Courses (1)" })).toBeVisible(VISIBLE);
  await live.getByRole("tab", { name: "Students (1)" }).click();
  await expect(live.getByRole("link", { name: people.student.name, exact: true })).toBeVisible(VISIBLE);
  await student.context().close();
  await live.context().close();
});

test("A lecturer opens the time dashboard's medians with the course PIN (exercises Rule 0319)", { tag: "@rule-0613" }, async ({ browser }) => {
  await persistence.seed("time-course");
  const page = await (await contextFor(browser, "lecturer")).newPage();
  await page.goto(`${signedIn.time}/${signedInCourse.timeId}/medians`);
  await page.getByRole("textbox", { name: "PIN code", exact: true }).fill(signedInCourse.pin);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Enter PIN" })).toHaveCount(0, VISIBLE);
  await expect(page.getByRole("heading", { name: "Medians", exact: true })).toBeVisible(VISIBLE);
  await expect(page.getByRole("row", { name: "Median 130 78 104", exact: true })).toBeVisible(VISIBLE);
  await page.context().close();
});

test("A student who shares presence picks a sentiment and sees themself online (exercises Rules 0046, 0064, 0280)", { tag: "@rule-0635" }, async ({ browser }) => {
  const page = await (await contextFor(browser, "student")).newPage();
  await signInToCourse(page, signedIn.publicCourseId, fixture.title);
  await page.getByRole("button", { name: "Profile menu" }).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "Share Presence · On" })).toBeVisible(VISIBLE);
  await page.getByRole("button", { name: /^Course sentiment/ }).filter({ visible: true }).first().click();
  const sentiment = page.getByRole("dialog", { name: "Course sentiment" });
  await expect(sentiment.getByRole("button", { name: "neutral", pressed: true })).toBeVisible(VISIBLE);
  await sentiment.getByRole("button", { name: "confident", exact: true }).click();
  await expect(page.getByRole("button", { name: "Course sentiment: confident. Open menu to change." })).toBeVisible(VISIBLE);
  await closeEveryDialog(page);
  await page.getByRole("button", { name: /^View Online/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("dialog", { name: "View Online" }).getByRole("link", { name: people.student.name, exact: true })).toBeVisible(VISIBLE);
  await page.context().close();
});

test("An enrolled student moves forward a slide of a talk and a cell of a notebook (exercises Rules 0047, 0049)", { tag: "@rule-0636" }, async ({ browser }) => {
  const page = await (await contextFor(browser, "enrolled")).newPage();
  await signInToCourse(page, signedIn.courseId, signedInCourse.title);
  await openCard(page, "Topic 1");
  await openCard(page, "Talk 1");
  await expect(page.getByText("1 of 4", { exact: true })).toBeVisible(VISIBLE);
  await page.getByRole("button", { name: "Forward 1 slide" }).click();
  await expect(page.getByText("2 of 4", { exact: true })).toBeVisible(VISIBLE);
  await backToTopic(page, "Topic 1");
  await openCard(page, "Notebook 1");
  await expect(page.getByText("Cell 1 of 2", { exact: true })).toBeVisible(VISIBLE);
  await page.getByRole("button", { name: "Next cell" }).click();
  await expect(page.getByText("Cell 2 of 2", { exact: true })).toBeVisible(VISIBLE);
  await page.context().close();
});

test("A student filters the calendar to assessments and finds the course for LLMs (exercises Rules 0042, 0284)", { tag: "@rule-0637" }, async ({ browser }) => {
  const page = await (await contextFor(browser, "enrolled")).newPage();
  await signInToCourse(page, signedIn.courseId, signedInCourse.title);
  await page.getByRole("button", { name: /^View Calendar/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("dialog", { name: `${signedInCourse.title} Calendar · 2026` })).toBeVisible(VISIBLE);
  const rows = page.getByRole("table", { name: `${signedInCourse.title} Calendar`, exact: true }).getByRole("row");
  // The header row and four weeks.
  await expect(rows).toHaveCount(5, VISIBLE);
  await page.getByRole("combobox", { name: "Show", exact: true }).filter({ visible: true }).first().selectOption({ label: "Assessments" });
  await expect(rows).toHaveCount(2, VISIBLE);
  await expect(page.getByRole("row", { name: /^Sep 21, 2026 3 Week 3 Assignment 1/ })).toBeVisible(VISIBLE);
  await closeEveryDialog(page);
  await page.getByRole("link", { name: "A version of this course for LLMs" }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "Docs for LLMs" })).toBeVisible(VISIBLE);
  await expect(page.getByRole("link", { name: "harness-rules-course-complete-llms.txt" })).toBeVisible(VISIBLE);
  await page.context().close();
});

test("A lecturer opens the time dashboard's lab views and a student's page (exercises Rule 0319)", { tag: "@rule-0638" }, async ({ browser }) => {
  await persistence.seed("time-course");
  const page = await (await contextFor(browser, "lecturer")).newPage();
  await page.goto(`${signedIn.time}/${signedInCourse.timeId}/lab/bylab`);
  await page.getByRole("textbox", { name: "PIN code", exact: true }).fill(signedInCourse.pin);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Enter PIN" })).toHaveCount(0, VISIBLE);
  await expect(page.getByRole("heading", { name: "Labs by lab" })).toBeVisible(VISIBLE);
  await expect(page.getByRole("row", { name: /^Harness Enrolled Student/ }).first()).toBeVisible(VISIBLE);
  await expect(page.getByRole("row", { name: /^Harness Quiet Student/ }).first()).toBeVisible(VISIBLE);
  await page.goto(`${signedIn.time}/${signedInCourse.timeId}/lab/bystep`);
  await expect(page.getByRole("heading", { name: "Labs by step" })).toBeVisible(VISIBLE);
  await expect(page.getByRole("row", { name: /^Harness Student/ }).first()).toBeVisible(VISIBLE);
  await page.goto(`${signedIn.time}/${signedInCourse.timeId}/lab/learning-records`);
  await expect(page.getByRole("heading", { name: "Learning records" })).toBeVisible(VISIBLE);
  await expect(page.getByRole("row", { name: /^harness-quiet/ }).first()).toBeVisible(VISIBLE);
  await page.goto(`${signedIn.time}/${signedInCourse.timeId}/harness-quiet`);
  await expect(page.getByRole("heading", { name: "Harness Quiet Student" })).toBeVisible(VISIBLE);
  await page.context().close();
});

test("One stroke drawn alone on a whiteboard is saved (exercises Rules 0275, 0276)", { tag: "@rule-0639" }, async ({ browser }) => {
  // Signing in, then Excalidraw loading from esm.sh into the editor's frame, take longer than the default 30 seconds.
  test.setTimeout(90_000);
  const page = await (await contextFor(browser, "enrolled")).newPage();
  await signInToCourse(page, signedIn.courseId, signedInCourse.title);
  await openCard(page, "Topic 1");
  await openCard(page, "Whiteboard 1");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true, pressed: true })).toBeVisible(VISIBLE);
  await expect(page.getByRole("status").filter({ hasText: "Use the whiteboard export menu to keep a copy of your work." })).toBeVisible(VISIBLE);
  await persistence.reset();
  await drawStroke(page, "Whiteboard 1");
  await expect(page.getByRole("status").filter({ hasText: "Drawing changes saved" })).toBeVisible(VISIBLE);
  expect(written(await persistence.writes()).filter((w) => w.endsWith(" whiteboard_scenes"))).toHaveLength(1);
  await page.context().close();
});

test("A lecturer syncs Moodle from Educator Control (exercises Rules 0633, 0634)", { tag: "@rule-0640" }, async ({ browser }) => {
  await persistence.reset();
  const page = await (await contextFor(browser, "lecturer")).newPage();
  await signInToCourse(page, signedInCourse.timeId, signedInCourse.title);
  await page.getByRole("button", { name: "Open Educator Control", exact: true }).filter({ visible: true }).first().click();
  const control = page.getByRole("dialog", { name: "Educator Control" });
  await expect(control).toBeVisible(VISIBLE);
  await control.getByRole("textbox", { name: "Moodle course ID", exact: true }).fill("1234");
  await control.getByRole("button", { name: "Sync Moodle", exact: true }).click();
  await expect(control.getByRole("status").filter({ hasText: "Moodle assignments synced." })).toBeVisible(VISIBLE);
  expect(written(await persistence.writes())).toEqual(expect.arrayContaining(["POST assignments", "POST assignments_submissions"]));
  await page.context().close();
});
