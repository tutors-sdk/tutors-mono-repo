import { test, expect as baseExpect } from '@playwright/test';

const expect = baseExpect.configure({ timeout: 30000 });
test.setTimeout(90000);

test('course-tree tour highlights the visible sidebar control without covering it', async ({ page }, testInfo) => {
  await page.goto('/course/tutors-reference-manual');
  const preferencesButton = page.getByRole('button', { name: 'Open Theme Menu', exact: true });
  const tour = page.getByRole('dialog', { name: 'Guided tour', exact: true });
  // Responsive layouts can leave a hidden copy ahead of the visible target.
  await page.evaluate(() => {
    const hidden = document.createElement('div');
    hidden.dataset.tour = 'toc';
    hidden.style.display = 'none';
    document.body.prepend(hidden);
  });
  for (const theme of ['tutors', 'dyslexia']) {
    await preferencesButton.click();
    await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme);
    await page.getByRole('button', { name: 'Start Tour', exact: true }).click();
    await expect(tour).toBeVisible();
    for (let step = 0; step < 4; step++) await tour.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(tour.getByRole('heading', { name: 'Course Tree', exact: true })).toBeVisible();
    const target = page.locator('[data-tour="toc"]:visible');
    const targetBox = (await target.boundingBox())!;
    await expect.poll(async () => Math.abs((await page.locator('.tour-tooltip').boundingBox())!.x - targetBox.x - targetBox.width - 12)).toBeLessThan(1);
    const tooltip = await page.locator('.tour-tooltip').boundingBox();
    expect(tooltip!.y).toBeGreaterThanOrEqual(16);
    expect(tooltip!.y + tooltip!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 14);
    expect(await page.locator('.tour-tooltip').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await tour.getByRole('button', { name: 'Done', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(tour.locator('button:not([tabindex="-1"])').first()).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`course-tree-tour-${theme}.png`) });
    await tour.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(tour).not.toBeVisible();
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await preferencesButton.click();
  await page.getByRole('button', { name: 'Start Tour', exact: true }).click();
  await expect(tour).toBeVisible();
  for (let step = 0; step < 2; step++) await tour.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(tour.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  expect(await page.locator('.tour-tooltip').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(tour).not.toBeVisible();
});

test('programme courses use regular cards in a responsive grid', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/course/wit-hdip-comp-sci-2023');
  await expect(page.getByRole('heading', { name: 'Higher Diploma in Computer Science 2023', exact: true })).toBeVisible();
  const cards = page.locator('.main-group .resource-card');
  await expect(cards).toHaveCount(24);
  await expect(page.locator('.main-group .resource-card.row')).toHaveCount(0);
  const first = (await cards.nth(0).boundingBox())!;
  const second = (await cards.nth(1).boundingBox())!;
  expect(first.width).toBeLessThan(400);
  expect(second.y).toBe(first.y);
  expect(second.x).toBeGreaterThan(first.x + first.width);
  await page.screenshot({ path: testInfo.outputPath('programme-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFirst = (await cards.nth(0).boundingBox())!;
  const mobileSecond = (await cards.nth(1).boundingBox())!;
  expect(mobileSecond.y).toBeGreaterThan(mobileFirst.y + mobileFirst.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('course-tree counts and chevrons stay aligned when branches expand', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/course/tutors-reference-manual');
  await page.getByRole('button', { name: 'Open course tree', exact: true }).click();
  const sections = page.getByRole('dialog').locator('.tree-section');
  await expect(sections).toHaveCount(5);
  const positions = () => sections.evaluateAll(rows => rows.map(row => {
    const count = row.querySelector('.tree-count')!.getBoundingClientRect();
    const chevron = row.querySelector('.tree-chevron svg')!.getBoundingClientRect();
    const title = row.querySelector('.tree-section-title')!.getBoundingClientRect();
    return { right: count.right, arrowX: chevron.x, offset: Math.abs(count.y + count.height / 2 - chevron.y - chevron.height / 2), titleOffset: Math.abs(count.y + count.height / 2 - title.y - title.height / 2) };
  }));
  const before = await positions();
  await sections.nth(1).click();
  for (const row of await positions()) {
    expect(row.right).toBe(before[0].right);
    expect(row.arrowX).toBe(before[0].arrowX);
    expect(row.offset).toBeLessThan(1);
    expect(row.titleOffset).toBeLessThan(1);
  }
  await page.screenshot({ path: testInfo.outputPath('tree-count-alignment.png') });
});
