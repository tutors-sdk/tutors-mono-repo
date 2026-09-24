import { test, expect } from "@playwright/test";
import { course } from "./support";

// Proves tests/bdd/features/ui/preferences-and-themes.feature: one test per scenario, titled and tagged to match.

const note = "/note/tutors-reference-manual/unit-1-getting-started/note-a-getting-started";

test("Preferences menu offers its choices above the page", { tag: "@rule-0037" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(course);
  await page.getByRole("button", { name: "Open Theme Menu", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences", exact: true });
  await expect(preferences.getByRole("heading", { name: "Preferences", exact: true })).toBeVisible();
  await expect(preferences.getByRole("combobox", { name: "Theme", exact: true }).locator("option")).toHaveCount(7);
  await expect(preferences.getByRole("button", { name: "Light", exact: true })).toBeVisible();
  await expect(preferences.getByRole("button", { name: "Dark", exact: true })).toBeVisible();
  await expect(preferences.getByRole("combobox", { name: "Language" }).locator("option")).toHaveCount(6);
  // Cards have one fixed geometry, so neither a density nor a card-style choice is offered.
  await expect(preferences.getByRole("combobox", { name: "Density" })).toHaveCount(0);
  await expect(preferences.getByRole("combobox", { name: "Card Style" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await preferences.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // Hit testing catches the course-title row painting over the portalled menu. Poll: the popover is
  // positioned a frame after it becomes visible, and until then it sits over the header.
  await expect.poll(() => preferences.evaluate(el => {
    const box = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + 20));
  })).toBe(true);
});

test("Every theme is readable in both appearances", { tag: "@rule-0038" }, async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(note);
  await expect(page.locator(".reading-panel")).toBeVisible();
  await page.getByRole("button", { name: "Open Theme Menu", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences", exact: true });
  const theme = preferences.getByRole("combobox", { name: "Theme", exact: true });
  const names = await theme.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  const surfaces = new Set<string>();
  for (const name of names) {
    await theme.selectOption(name);
    await expect(page.locator("html")).toHaveAttribute("data-theme", name);
    for (const mode of ["Light", "Dark"]) {
      await preferences.getByRole("button", { name: mode, exact: true }).click();
      const style = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        const luminance = (color: string) => {
          context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        const contrast = (fg: string, bg: string) => {
          const a = luminance(fg), b = luminance(bg);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        };
        const panel = getComputedStyle(document.querySelector(".reading-panel")!);
        const menu = document.querySelector(".paper-popover")!;
        const label = getComputedStyle(document.querySelector(".preference-field > span")!);
        return {
          surface: panel.backgroundColor,
          text: contrast(getComputedStyle(document.body).color, panel.backgroundColor),
          label: contrast(label.color, getComputedStyle(menu).backgroundColor),
          gap: Math.abs(menu.getBoundingClientRect().top - document.querySelector(".shell-header")!.getBoundingClientRect().bottom)
        };
      });
      surfaces.add(style.surface);
      expect(style.text, `${name} ${mode} body contrast`).toBeGreaterThanOrEqual(4.5);
      expect(style.label, `${name} ${mode} label contrast`).toBeGreaterThanOrEqual(4.5);
      expect(style.gap, `${name} ${mode} menu below header`).toBeLessThanOrEqual(1);
    }
  }
  expect(surfaces.size).toBeGreaterThan(7);
});

test("Dyslexia theme survives a reload", { tag: "@rule-0039" }, async ({ page }) => {
  await page.goto(note);
  await page.getByRole("button", { name: "Open Theme Menu", exact: true }).click();
  await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption("dyslexia");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dyslexia");
  const prose = page.locator(".reading-panel > .prose");
  await expect(prose).toHaveCSS("font-size", "20px");
  await expect(prose).toHaveCSS("line-height", "37px");
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("OpenDyslexic");
  expect(await page.evaluate(async () => (await document.fonts.load("20px OpenDyslexic")).length)).toBeGreaterThan(0);
});
