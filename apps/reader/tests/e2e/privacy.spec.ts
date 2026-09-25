import { test, expect, type Page } from "@playwright/test";
import { course, signInAs } from "./support";

const privacyDialog = (page: Page) => page.getByRole("dialog", { name: "Choose what Tutors records", exact: true });

async function openCourse(page: Page) {
  await page.goto(course);
  await page.getByRole("heading", { name: "Reference Course", exact: true }).waitFor();
}

async function openProfileMenu(page: Page) {
  await page.locator('[data-tour="profile"] .paper-menu-trigger').click();
  return page.getByRole("dialog", { name: "Profile menu", exact: true });
}

test("Privacy dialog asks a student who has not chosen", { tag: "@rule-0070" }, async ({ page }) => {
  await openCourse(page);
  await signInAs(page, "student", [], null);
  const dialog = privacyDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /^Learning analytics/ })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Share Presence/ })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Save choices", exact: true }).click();
  await expect(dialog).toBeHidden();
  const menu = await openProfileMenu(page);
  await expect(menu).toContainText("Share Presence · Off");
  await expect(menu).toContainText("Learning analytics · Off");
});

test("Privacy dialog stays closed once a student has chosen", { tag: "@rule-0070" }, async ({ page }) => {
  await openCourse(page);
  await signInAs(page, "student");
  await expect(privacyDialog(page)).toBeHidden();
});

test("Profile menu changes privacy choices", { tag: "@rule-0071" }, async ({ page }) => {
  await openCourse(page);
  await signInAs(page, "student");
  const menu = await openProfileMenu(page);
  await menu.getByRole("button", { name: /^Learning analytics · Off/ }).click();
  await expect(menu).toContainText("Learning analytics · On");
  await expect(menu.getByRole("link", { name: /^Download my data/ })).toHaveAttribute("href", "/api/privacy");
});
