import { test, expect as baseExpect } from '@playwright/test';

const expect = baseExpect.configure({ timeout: 30000 });
test.setTimeout(90000);

const course = '/course/reference-course';
test('Paper shell keeps course, lab, search and mobile navigation connected', async ({ page }) => {
  await page.goto(course);
  await expect(page.getByRole('heading', { name: 'Reference Course', exact: true })).toBeVisible();
  await expect(page.getByText('9 · Author’s order')).toBeVisible();
  await page.getByRole('link', { name: 'Open topic →', exact: true }).click();
  await page.locator('.resource-link[href="/lab/reference-course/topic-01-typical/unit-1/book-a"]').click();
  await expect(page.getByRole('heading', { name: 'Objectives', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Next → Text', exact: true }).click();
  await expect(page).toHaveURL(/\/book-a\/01$/);
  await page.locator('#main-content').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/book-a\/02$/);
  await page.getByRole('button', { name: 'Open Theme Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open Theme Menu', exact: true })).toBeFocused();
  await expect(page.locator('.shell-header')).toHaveCSS('background-color', 'rgb(27, 27, 27)');
  await expect(page.locator('.tutors-shell')).toHaveCSS('background-color', 'rgb(17, 17, 17)');

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('#main-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Course navigation', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Moodle', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Resources', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('searchbox', { name: 'Enter search term:', exact: true }).fill('lab');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\?q=lab/);
  await expect(page.locator('.search-results .resource-card')).not.toHaveCount(0);
  const hrefs = await page.locator('.search-results .resource-link').evaluateAll(links => links.map(link => link.getAttribute('href')));
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test('preferences popover and calendar dialog stay responsive without losing the reading position', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('cardStyle', 'circular'));
  await page.goto(course);
  await expect(page.getByRole('heading', { name: 'Reference Course', exact: true })).toBeVisible();
  await expect(page.locator('.resource-card.circular')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Theme Menu', exact: true }).click();
  const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await expect(preferences).toBeVisible();
  await expect(preferences.getByRole('heading', { name: 'Preferences', exact: true })).toBeVisible();
  await expect(preferences.getByRole('combobox', { name: 'Theme', exact: true }).locator('option')).toHaveCount(7);
  await expect(preferences.getByRole('combobox', { name: 'Card Style' })).toHaveCount(0);
  await expect(preferences.getByRole('combobox', { name: 'Density' }).locator('option')).toHaveCount(2);
  await expect(preferences.getByRole('combobox', { name: 'Language' }).locator('option')).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('preferences-desktop.png') });
  await preferences.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(preferences).toHaveCSS('background-color', 'rgb(27, 27, 27)');
  await page.screenshot({ path: testInfo.outputPath('preferences-dark.png') });
  await preferences.getByRole('button', { name: 'Light', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await preferences.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('preferences-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open Theme Menu', exact: true })).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.shell-navigation').getByRole('button', { name: 'View Calendar for this course' }).click();
  const calendar = page.getByRole('dialog', { name: 'Semester 1 · 2026', exact: true });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator('tbody tr')).toHaveCount(16);
  await expect(calendar.locator('.week-number').first()).toHaveText('Week No. 0');
  await expect(calendar.locator('time[datetime^="2025"]').first()).toContainText('2025');
  await calendar.getByRole('combobox', { name: 'Show', exact: true }).selectOption('assessments');
  await expect(calendar.locator('tbody tr')).toHaveCount(3);
  await calendar.getByRole('button', { name: 'This week', exact: true }).click();
  await expect(calendar.locator('tbody tr')).toHaveCount(16);
  await expect(calendar.locator('[aria-current="date"]')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('calendar-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await calendar.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('calendar-mobile.png') });
  await calendar.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/\/course\/reference-course$/);
});

test('header controls match and the anonymous account menu contains navigation', async ({ page }, testInfo) => {
  await page.goto(course);
  await expect(page.getByRole('heading', { name: 'Reference Course', exact: true })).toBeVisible();
  const search = page.locator('[data-tour="search"]');
  const preferences = page.locator('[data-tour="layout"]');
  for (const property of ['font-size', 'font-weight', 'color', 'padding', 'min-height']) {
    expect(await search.evaluate((el, key) => getComputedStyle(el).getPropertyValue(key), property))
      .toBe(await preferences.evaluate((el, key) => getComputedStyle(el).getPropertyValue(key), property));
  }
  await page.locator('[data-tour="profile"] button').click();
  const account = page.getByRole('dialog');
  await expect(account.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('account-menu.png') });
  await account.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test('manual notes, course tree and creator use working accessible controls', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.goto('/note/tutors-reference-manual/unit-1-getting-started/note-d-properties');
  await expect(page.locator('.reading-panel')).toBeVisible();
  const contents = page.locator('details.table-of-contents');
  await expect(contents).not.toHaveAttribute('open');
  await contents.getByText('On this page', { exact: true }).click();
  await expect(contents).toHaveAttribute('open');
  await expect(page.locator('button.copy').first()).toHaveAccessibleName('Copy code');
  await expect(page.locator('.prose .header-anchor').first()).toHaveCSS('text-decoration-line', 'none');
  await page.getByRole('button', { name: 'Open course tree', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Course Properties', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Mermaid Diagrams', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page).toHaveURL(/note-a-mermaid$/);
  await page.getByRole('button', { name: 'Open course tree', exact: true }).click();
  const tree = page.getByRole('dialog');
  await expect(tree.getByRole('link', { name: 'Mermaid Diagrams', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(tree.locator('a[aria-current="page"]')).toHaveCount(1);
  await tree.getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('#main-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('manual-note-mobile.png') });

  await page.goto('/create');
  await page.getByLabel('Course Name', { exact: false }).fill('UI test course');
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await page.getByLabel('Number of Units', { exact: true }).fill('1');
  await page.getByLabel('Topics per Unit', { exact: true }).fill('1');
  await page.getByLabel('Include a README', { exact: true }).check();
  await page.getByLabel('README description', { exact: true }).fill('A course for testing the new UI.');
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await page.getByText('course.md', { exact: true }).click();
  await expect(page.locator('details[open] pre')).toContainText('UI test course');
  await page.screenshot({ path: testInfo.outputPath('creator-mobile.png') });
  await page.getByRole('button', { name: 'Generate →', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ui-test-course.zip', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('ui-test-course.zip');
  await expect(page.getByText('Downloaded!', { exact: true })).toBeVisible();
});

test('quiz answers survive question navigation and reset after a retake', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/quiz/reference-course/topic-07-reference/quiz-1');
  await expect(page.getByRole('radio').first()).toBeVisible();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('.shell-navigation').getByRole('link', { name: 'Course overview', exact: true }).click();
  await expect(page).toHaveURL(/\/quiz\//);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByRole('heading', { name: /— Results$/ })).toBeFocused();
  await page.getByRole('button', { name: 'Retake', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('radio').first()).not.toBeChecked();
});

test('notebook navigation, saved output and slide controls remain usable', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/notebook/python-fundmentals/topic-03-operators/unit-1/notebook-operators');
  const navigation = page.getByRole('navigation', { name: 'Notebook cell navigation', exact: true });
  await expect(navigation).toContainText('Cell 1 of 19');
  await navigation.getByRole('button', { name: 'Next cell', exact: true }).click();
  await expect(navigation).toContainText('Cell 2 of 19');
  await page.getByRole('button', { name: 'Show saved output', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /Hide output/i }).first()).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'python exercise code' }).first()).toBeVisible();
  await page.goto('/talk/python-fundmentals/topic-03-operators/unit-1/talk-1-operators');
  const slides = page.getByRole('region', { name: 'Operators in Python', exact: true });
  await expect(slides).toContainText('1 of 11');
  await expect(slides.getByRole('button', { name: 'Back 1 slide', exact: true })).toBeDisabled();
  await slides.getByRole('button', { name: 'Forward 1 slide', exact: true }).click();
  await expect(slides).toContainText('2 of 11');
  await page.locator('#main-content').focus();
  await page.keyboard.press('ArrowRight');
  await expect(slides).toContainText('2 of 11');
  await slides.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slides).toContainText('3 of 11');
});

test('course header exposes info on desktop and a direct course tree on mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(course);
  const header = page.locator('.shell-header');
  const title = header.locator('[data-tour="course-title"]');
  await expect(title).toHaveText('Reference Course');
  await expect(title).toHaveCSS('font-size', '24px');
  await header.getByRole('button', { name: 'Open course info', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Course Info', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const sidebar = page.locator('.shell-navigation');
  await expect(sidebar.getByRole('button', { name: 'Open course info', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Edit this course', exact: true })).toBeVisible();
  await expect(sidebar.getByText('More course tools', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('course-header-desktop.png') });

  for (const theme of ['tutors', 'dyslexia']) {
    await header.getByRole('button', { name: 'Open Theme Menu', exact: true }).click();
    await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme);
    await page.keyboard.press('Escape');
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(title).toBeVisible();
      await expect(header.getByRole('button', { name: 'Open course info', exact: true })).toBeHidden();
      expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const treeButton = header.getByRole('button', { name: 'Open course tree', exact: true });
      await expect(treeButton).toContainText('Course Tree');
      await treeButton.click();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await expect(page.getByRole('dialog', { name: 'Course Tree', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(treeButton).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`course-header-${width}-${theme}.png`) });
    }
    await page.screenshot({ path: testInfo.outputPath(`course-header-mobile-${theme}.png`) });
  }
  await header.getByRole('button', { name: 'Course navigation', exact: true }).click();
  const navigation = page.getByRole('dialog', { name: 'Course navigation', exact: true });
  await expect(navigation.getByRole('link', { name: 'Edit this course', exact: true })).toBeVisible();
  await navigation.getByRole('button', { name: 'Open course info', exact: true }).click();
  const info = page.getByRole('dialog', { name: 'Course Info', exact: true });
  await expect(info).toBeVisible();
  await info.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(navigation.getByRole('button', { name: 'Open course info', exact: true })).toBeFocused();
});

test('larger tinted cards, wide labs and mobile menus keep the Paper layout', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/topic/reference-course/topic-01-typical');
  await expect(page.locator('.shell-navigation').getByText('Companions', { exact: true })).toBeVisible();
  const lab = page.locator('.resource-card').filter({ has: page.locator('.resource-type', { hasText: /^lab$/ }) }).first();
  const talk = page.locator('.resource-card').filter({ has: page.locator('.resource-type', { hasText: /^talk$/ }) }).first();
  await expect(lab).toBeVisible();
  await expect(talk).toBeVisible();
  expect(await lab.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(await talk.evaluate(el => getComputedStyle(el).backgroundColor));
  expect((await lab.locator('.lo-artwork').boundingBox())!.width).toBeGreaterThanOrEqual(80);
  await page.screenshot({ path: testInfo.outputPath('tinted-resource-cards.png') });
  await lab.locator('.resource-link').click();
  const panel = page.locator('.lab-content .reading-panel');
  const prose = panel.locator('article');
  await expect(panel).toBeVisible();
  expect(Math.abs((await panel.boundingBox())!.width - (await page.locator('.lab-content').boundingBox())!.width)).toBeLessThan(2);
  expect((await prose.boundingBox())!.width).toBeGreaterThan(720);
  expect((await prose.boundingBox())!.width).toBeLessThan(1000);
  await page.screenshot({ path: testInfo.outputPath('wide-lab.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open Theme Menu', exact: true }).click();
  const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await expect(preferences).toBeVisible();
  // Hit testing catches the course-title row painting over the portalled menu.
  expect(await preferences.evaluate(el => {
    const box = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + 20));
  })).toBe(true);
  await preferences.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: testInfo.outputPath('mobile-menu-above-course-tree.png') });
  await page.keyboard.press('Escape');
  expect(await page.locator('#main-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
