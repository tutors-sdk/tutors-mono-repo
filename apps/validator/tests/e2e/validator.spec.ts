import { test, expect } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import AxeBuilder from "@axe-core/playwright";
import { publishedCourse } from "../../../../tests/support/published-course";

const courseUrl = "https://course.example/tutors.json";
const zip = (enrollment: string) =>
  Buffer.from(
    zipSync({
      "sample/course.md": strToU8("# Sample course"),
      "sample/enrollment.yaml": strToU8(enrollment),
      "sample/netlify.toml": strToU8('[build]\npublish = "json"\n')
    })
  );

test("A published course with an invalid student entry", { tag: "@rule-0754" }, async ({ page }) => {
  await page.route(courseUrl, (route) => route.fulfill({ json: { ...publishedCourse, enrollment: { educators: ["lecturer"], students: [{ name: "Alice" }] } } }));
  await page.goto("/");
  await expect(page.locator('[data-tour="validator"]')).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Course URL or Netlify site name").fill(courseUrl);
  await page.getByRole("button", { name: "Check course URL" }).click();
  await expect(page.locator(".finding")).toContainText(/Error[\s\S]*V006[\s\S]*enrollment.yaml/);
  await page.getByText("What was checked?", { exact: true }).click();
  await expect(page.getByText("Published data checked", { exact: true })).toBeVisible();
  await expect(page.getByText(/Upload a source ZIP to check folder names/)).toBeVisible();
});

test("A valid published course", { tag: "@rule-0754" }, async ({ page }, testInfo) => {
  await page.route(courseUrl, (route) => route.fulfill({ json: publishedCourse }));
  await page.goto("/");
  await page.getByLabel("Course URL or Netlify site name").fill(courseUrl);
  await page.getByRole("button", { name: "Check course URL" }).click();
  await expect(page.getByText("No problems found.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Published course checks passed", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator(".result-banner").screenshot({ path: testInfo.outputPath("success.png") });
});

test("A course with warnings but no errors", { tag: "@rule-0757" }, async ({ page }, testInfo) => {
  const legacy = { ...publishedCourse, authLevel: undefined };
  await page.route(courseUrl, (route) => route.fulfill({ json: legacy }));
  await page.goto("/");
  await page.getByLabel("Course URL or Netlify site name").fill(courseUrl);
  await page.getByRole("button", { name: "Check course URL" }).click();
  await expect(page.locator(".result-banner")).toHaveAttribute("data-state", "warn");
  await expect(page.getByRole("heading", { name: "1 warning to review", exact: true })).toBeVisible();
  await expect(page.locator(".finding")).toHaveCount(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("region", { name: "Validation results" }).screenshot({ path: testInfo.outputPath("warning.png") });
});

test("Error and warning findings can be filtered", { tag: "@rule-0757" }, async ({ page }, testInfo) => {
  const legacy = { ...publishedCourse, authLevel: undefined };
  await page.route(courseUrl, (route) => route.fulfill({ json: { ...legacy, enrollment: { students: [{ name: "Alice" }, { id: "bob" }] } } }));
  await page.goto("/");
  await page.getByLabel("Course URL or Netlify site name").fill(courseUrl);
  await page.getByRole("button", { name: "Check course URL" }).click();
  await expect(page.locator(".result-banner")).toHaveAttribute("data-state", "error");
  await expect(page.getByRole("heading", { name: "2 errors need attention", exact: true })).toBeVisible();
  await expect(page.locator(".finding-group")).toHaveCount(2);
  await expect(page.locator(".finding")).toHaveCount(3);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("region", { name: "Validation results" }).screenshot({ path: testInfo.outputPath("errors.png") });
  await page.getByRole("button", { name: "Warning 1", exact: true }).click();
  await expect(page.locator(".finding")).toHaveCount(1);
  await expect(page.locator(".finding")).toHaveAttribute("data-severity", "warn");
  await page.getByRole("button", { name: "Errors 2", exact: true }).click();
  await expect(page.locator(".finding")).toHaveCount(2);
  await page.getByRole("button", { name: "All 3", exact: true }).click();
  await expect(page.locator(".finding")).toHaveCount(3);
});

test("A local ZIP with invalid enrollment", { tag: "@rule-0755" }, async ({ page }) => {
  await page.goto("/");
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") uploads.push(request.url());
  });
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose ZIP file" }).click();
  await (await choosing).setFiles({ name: "course.zip", mimeType: "application/zip", buffer: zip("educators: [lecturer]\nstudents:\n  - name: Alice\n") });
  await expect(page.locator(".finding")).toContainText(/Error[\s\S]*V006[\s\S]*enrollment.yaml/);
  await page.getByText("What was checked?", { exact: true }).click();
  await expect(page.getByText("Source files checked", { exact: true })).toBeVisible();
  expect(uploads).toEqual([]);
});

test("A course ZIP is dropped into the upload area", { tag: "@rule-0755" }, async ({ page }) => {
  await page.goto("/");
  const dropped = await page.evaluateHandle(
    (bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], "dropped.zip", { type: "application/zip" }));
      return data;
    },
    [...zip("educators: [lecturer]\n")]
  );
  const area = page.getByRole("region", { name: "Course ZIP drop area" });
  await area.dispatchEvent("dragover", { dataTransfer: dropped });
  await expect(area).toHaveClass(/dragging/);
  await area.dispatchEvent("drop", { dataTransfer: dropped });
  await expect(area).not.toHaveClass(/dragging/);
  await expect(page.getByText("Checked dropped.zip", { exact: true })).toBeVisible();
  await expect(page.getByText("No problems found.", { exact: true })).toBeVisible();
});

test("The complete source tree is validated", { tag: "@rule-0755" }, async ({ page }) => {
  const files = {
    "course.md": "# Sample course",
    "netlify.toml": '[build]\npublish = "json"\n',
    "enrollment.yaml": "educators: [lecturer]\nstudents:\n  - name: Alice\n  - id: bob\n",
    "unit-1/unit.md": "# Unit",
    "unit-1/topic-01/topic.md": "# Week 1\n![Missing](missing.png)\n```mermaid\nflowchart TD\n A[Unclosed\n```",
    "unit-1/topic-01/quiz-1/quiz.md": "# Quiz\n```quiz\n```",
    "unit-1/topic-01/talk-1/talk.md": "# Talk",
    "unit-1/topic-01/talk-1/slides.marp": "# Slide without marp front matter"
  };
  const archive = Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)]))));
  await page.goto("/");
  await page.getByLabel("Choose a ZIP of your course folder").setInputFiles({ name: "full-course.zip", mimeType: "application/zip", buffer: archive });
  for (const rule of ["V006", "V009", "V013", "V015", "V017"]) await expect(page.locator(".finding").filter({ hasText: rule }).first()).toBeVisible();
  await expect(page.locator(".finding").filter({ hasText: "students[0]" })).toBeVisible();
  await expect(page.locator(".finding").filter({ hasText: "students[1]" })).toBeVisible();
  await expect(page.locator(".finding").filter({ hasText: "could not be checked" })).toHaveCount(0);
});

test("Multiple ZIPs are refused", { tag: "@rule-0756" }, async ({ page }) => {
  await page.goto("/");
  const dropped = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    for (const name of ["first.zip", "second.zip"]) data.items.add(new File(["zip"], name));
    return data;
  });
  await page.getByRole("region", { name: "Course ZIP drop area" }).dispatchEvent("drop", { dataTransfer: dropped });
  await expect(page.getByRole("alert")).toContainText("one course ZIP at a time");
  await expect(page.getByText("No problems found.", { exact: true })).toHaveCount(0);
});

test("The validator works in light, dark and mobile layouts", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose ZIP file" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("dark.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Choose ZIP file" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("mobile.png"), fullPage: true });
});

test("A new ZIP replaces a pending URL check", { tag: "@rule-0755" }, async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(courseUrl, async (route) => {
    await gate;
    await route.fulfill({ json: {} }).catch(() => {});
  });
  await page.goto("/");
  await page.getByLabel("Course URL or Netlify site name").fill(courseUrl);
  const request = page.waitForRequest(courseUrl);
  await page.getByRole("button", { name: "Check course URL" }).click();
  await request;
  await page.getByLabel("Choose a ZIP of your course folder").setInputFiles({ name: "latest.zip", mimeType: "application/zip", buffer: zip("educators: [lecturer]\n") });
  release();
  await expect(page.getByText("No problems found.", { exact: true })).toBeVisible();
  await expect(page.getByText("Checked latest.zip", { exact: true })).toBeVisible();
  await expect(page.locator(".finding")).toHaveCount(0);
});

test("An unreadable ZIP", { tag: "@rule-0756" }, async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Choose a ZIP of your course folder").setInputFiles({ name: "bad.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await expect(page.getByRole("alert")).toContainText("Zip the course folder and try again.");
  await expect(page.getByText("No problems found.", { exact: true })).toHaveCount(0);
});

test("A course host refuses cross-origin reads", { tag: "@rule-0756" }, async ({ page }) => {
  await page.route(courseUrl, (route) => route.abort("failed"));
  await page.goto("/");
  await page.getByLabel("Course URL or Netlify site name").fill(courseUrl);
  await page.getByRole("button", { name: "Check course URL" }).click();
  await expect(page.getByRole("alert")).toContainText("check a source ZIP locally");
  await expect(page.getByText("No problems found.", { exact: true })).toHaveCount(0);
});
