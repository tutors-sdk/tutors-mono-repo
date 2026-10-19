import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { course, signInAs } from "./support";

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });

test("An educator downloads the enrollment draft", { tag: "@rule-0375" }, async ({ page }, testInfo) => {
  const yaml = "# Draft enrollment\neducators: [lecturer]\nwhitelist: [alice]\nstudents: [{name: Alice, id: alice}]\n";
  await page.route("**/api/courses/reference-course/enrollment", (route) => route.fulfill({ contentType: "application/yaml", body: yaml }));
  await page.goto(course);
  await signInAs(page, "lecturer");
  await page.locator(".shell-navigation").getByRole("button", { name: "Open Educator Control", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Educator Control", exact: true });
  await panel.getByRole("tab", { name: "Enrollment", exact: true }).click();
  const button = panel.getByRole("button", { name: "Export enrollment.yaml", exact: true });
  await button.focus();
  const downloading = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("enrollment.yaml");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe(yaml);
  await expect(panel).toContainText("Review the draft before using it to restrict access.");
  for (const appearance of ["light", "dark"] as const) {
    await page.evaluate((appearance) => {
      document.documentElement.classList.toggle("dark", appearance === "dark");
      document.documentElement.style.colorScheme = appearance;
    }, appearance);
    await page.emulateMedia({ colorScheme: appearance });
    const violations = (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations;
    expect(violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
    await testInfo.attach(`enrollment-export-${appearance}`, { body: await panel.screenshot(), contentType: "image/png" });
  }
});

test("A failed enrollment export can be retried", { tag: "@rule-0376" }, async ({ page }) => {
  await page.route("**/api/courses/reference-course/enrollment", (route) => route.fulfill({ status: 502, body: "Unavailable" }));
  await page.goto(course);
  await signInAs(page, "lecturer");
  await page.locator(".shell-navigation").getByRole("button", { name: "Open Educator Control", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Educator Control", exact: true });
  await panel.getByRole("tab", { name: "Enrollment", exact: true }).click();
  const button = panel.getByRole("button", { name: "Export enrollment.yaml", exact: true });
  await button.click();
  await expect(panel.getByRole("alert")).toContainText("Export failed.");
  await expect(button).toBeEnabled();
  await button.click();
  await expect(panel.getByRole("alert")).toContainText("Export failed.");
});
