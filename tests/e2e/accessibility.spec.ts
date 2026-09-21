import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const COURSE_URL = '/course/reference-course';

test.describe('Accessibility Audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COURSE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('course page has no critical or serious ARIA violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter(v => v.impact === 'critical');
    const serious = results.violations.filter(v => v.impact === 'serious');
    const moderate = results.violations.filter(v => v.impact === 'moderate');
    const minor = results.violations.filter(v => v.impact === 'minor');

    const total = results.violations.length;
    const passed = results.passes.length;
    const score = passed + total > 0 ? Math.round((passed / (passed + total)) * 100) : 100;

    process.stdout.write('\n');
    process.stdout.write('═══════════════════════════════════════\n');
    process.stdout.write('       ACCESSIBILITY AUDIT REPORT      \n');
    process.stdout.write('═══════════════════════════════════════\n');
    process.stdout.write(`  Score:    ${score}% (${passed} passed, ${total} violations)\n`);
    process.stdout.write(`  Critical: ${critical.length}\n`);
    process.stdout.write(`  Serious:  ${serious.length}\n`);
    process.stdout.write(`  Moderate: ${moderate.length}\n`);
    process.stdout.write(`  Minor:    ${minor.length}\n`);
    process.stdout.write('───────────────────────────────────────\n');

    for (const violation of results.violations) {
      process.stdout.write(`  [${violation.impact?.toUpperCase()}] ${violation.id}: ${violation.description}\n`);
      process.stdout.write(`    Help: ${violation.helpUrl}\n`);
      process.stdout.write(`    Affected: ${violation.nodes.length} element(s)\n`);
      for (const node of violation.nodes.slice(0, 3)) {
        process.stdout.write(`      → ${node.target.join(' > ')}\n`);
      }
      if (violation.nodes.length > 3) {
        process.stdout.write(`      ... and ${violation.nodes.length - 3} more\n`);
      }
      process.stdout.write('\n');
    }

    process.stdout.write('═══════════════════════════════════════\n');

    expect(critical, `${critical.length} critical violation(s) found`).toHaveLength(0);
    expect(serious, `${serious.length} serious violation(s) found`).toHaveLength(0);
  });

  test('course page passes landmark and navigation rules', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['best-practice'])
      .analyze();

    const passed = results.passes.length;
    const total = results.violations.length;

    process.stdout.write('\n');
    process.stdout.write('── Best Practice Rules ──\n');
    process.stdout.write(`  Passed: ${passed}, Violations: ${total}\n`);

    for (const violation of results.violations) {
      process.stdout.write(`  [${violation.impact?.toUpperCase()}] ${violation.id}: ${violation.description}\n`);
    }
  });

  test('dark mode has no additional violations', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = results.violations.filter(v => v.impact === 'critical');
    const serious = results.violations.filter(v => v.impact === 'serious');

    process.stdout.write('\n');
    process.stdout.write('── Dark Mode Audit ──\n');
    process.stdout.write(`  Violations: ${results.violations.length} (${critical.length} critical, ${serious.length} serious)\n`);

    for (const violation of results.violations) {
      process.stdout.write(`  [${violation.impact?.toUpperCase()}] ${violation.id}: ${violation.description}\n`);
    }

    expect(critical, 'Dark mode introduced critical violations').toHaveLength(0);
    expect(serious, 'Dark mode introduced serious violations').toHaveLength(0);
  });
});
