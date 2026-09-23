import { test, expect as baseExpect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const expect = baseExpect.configure({ timeout: 30000 });

test('every theme reaches chrome, controls and reading content in both appearances', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  await page.goto('/note/tutors-reference-manual/unit-1-getting-started/note-a-getting-started');
  await expect(page.locator('.reading-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Open Theme Menu', exact: true }).click();
  const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  const theme = preferences.getByRole('combobox', { name: 'Theme', exact: true });
  const names = await theme.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  const surfaces = new Set<string>();
  for (const name of names) {
    await theme.selectOption(name);
    await expect(page.locator('html')).toHaveAttribute('data-theme', name);
    for (const mode of ['Light', 'Dark']) {
      await preferences.getByRole('button', { name: mode, exact: true }).click();
      const style = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const panel = getComputedStyle(document.querySelector('.reading-panel')!);
        const menu = document.querySelector('.paper-popover')!;
        const select = menu.querySelector('select')!;
        const menuStyle = getComputedStyle(menu);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        function luminance(color: string) {
          context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        }
        function contrast(fg: string, bg: string) {
          const a = luminance(fg), b = luminance(bg);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        }
        const label = getComputedStyle(document.querySelector('.preference-field > span')!);
        return { font: body.fontFamily, surface: panel.backgroundColor, textContrast: contrast(body.color, panel.backgroundColor), labelContrast: contrast(label.color, menuStyle.backgroundColor), top: menu.getBoundingClientRect().top, headerBottom: document.querySelector('.shell-header')!.getBoundingClientRect().bottom, selectBorder: getComputedStyle(select).borderColor, menuBorder: menuStyle.borderBottomColor, arrowInset: getComputedStyle(select.parentElement!, '::after').right };
      });
      surfaces.add(style.surface);
      expect(style.textContrast, `${name} ${mode} body contrast`).toBeGreaterThanOrEqual(4.5);
      expect(style.labelContrast, `${name} ${mode} label contrast`).toBeGreaterThanOrEqual(4.5);
      expect(Math.abs(style.top - style.headerBottom)).toBeLessThanOrEqual(1);
      expect(style.selectBorder).toBe(style.menuBorder);
      expect(style.arrowInset).toBe('16px');
      if (name === 'dyslexia') {
        expect(style.font).toContain('OpenDyslexic');
        expect(await page.evaluate(async () => (await document.fonts.load('20px OpenDyslexic')).length)).toBeGreaterThan(0);
        await page.screenshot({ path: testInfo.outputPath(`dyslexia-${mode.toLowerCase()}.png`) });
      }
    }
  }
  expect(surfaces.size).toBeGreaterThan(7);
  await theme.selectOption('dyslexia');
  await preferences.getByRole('button', { name: 'Light', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dyslexia');
  await expect(page.locator('.reading-panel > .prose')).toHaveCSS('font-size', '20px');
  await expect(page.locator('.reading-panel > .prose')).toHaveCSS('line-height', '37px');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.filter(v => ['critical', 'serious'].includes(v.impact ?? '')), JSON.stringify(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })))).toEqual([]);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Open Theme Menu', exact: true }).click();
    await expect(preferences).toBeVisible();
    // The popover moves focus in and starts listening for Escape on the next frame; wait for that, as a person would.
    await expect.poll(() => preferences.evaluate(el => el.contains(document.activeElement))).toBe(true);
    expect(await preferences.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(preferences).not.toBeVisible();
  }
});
