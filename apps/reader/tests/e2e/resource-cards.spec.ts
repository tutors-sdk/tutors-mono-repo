import { test, expect, type Locator, type Page } from "@playwright/test";
import { course, fitsViewport } from "./support";

// Proves tests/bdd/features/ui/resource-cards.feature: one test per scenario, titled and tagged to match.

const typicalTopic = "/topic/reference-course/topic-01-typical";
// Public pages only: real institution courses can require sign-in, which CI does not have.
const cardPages = [course, typicalTopic];

const cardOfType = (page: Page, type: string) => page.locator(".resource-card").filter({ has: page.locator(`.resource-type[title="${type}"]`) }).first();
const boxes = (cards: Locator) => cards.evaluateAll(all => all.slice(0, 2).map(card => card.getBoundingClientRect().toJSON() as DOMRect));

test("Cards show title, artwork and type colour", { tag: "@rule-0029" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(typicalTopic);
  const lab = cardOfType(page, "lab");
  const talk = cardOfType(page, "talk");
  await expect(lab).toBeVisible();
  expect(await lab.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(await talk.evaluate(el => getComputedStyle(el).backgroundColor));
  for (const card of [lab, talk]) {
    const cardBox = (await card.boundingBox())!;
    const heading = (await card.locator(".resource-heading").boundingBox())!;
    const artwork = (await card.locator(".lo-artwork").boundingBox())!;
    expect(heading.y + heading.height).toBeLessThanOrEqual(artwork.y);
    expect(artwork.width).toBeGreaterThanOrEqual(80);
    expect(Math.abs(artwork.x + artwork.width / 2 - cardBox.x - cardBox.width / 2)).toBeLessThan(1);
    const icon = card.locator(".resource-type svg");
    await expect(icon).toBeVisible();
    expect(await icon.evaluate(el => getComputedStyle(el).color)).toBe(await card.evaluate(el => getComputedStyle(el).borderTopColor));
  }
});

test("Cards in a grid share the tallest height", { tag: "@rule-0030" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(typicalTopic);
  const grid = page.locator(".card-grid").first();
  await expect(grid.locator(".resource-card").first()).toBeVisible();
  await expect.poll(() => grid.locator(".resource-card").evaluateAll(cards => {
    const heights = cards.map(card => card.getBoundingClientRect().height);
    return cards.length > 1 && Math.max(...heights) - Math.min(...heights) < 1;
  })).toBe(true);
});

test("Phone viewport sets cards two to a row", { tag: "@rule-0031" }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of cardPages) {
    await page.goto(url);
    // A grid with a third card; each card sits in its own wrapper, the grid's direct child.
    const grid = page.locator(".main-group .card-grid").filter({ has: page.locator(":nth-child(3) > .resource-card") }).first();
    const cards = grid.locator(".resource-card");
    await expect(cards.nth(2)).toBeVisible();
    const gridBox = (await grid.boundingBox())!;
    const [first, second, third] = await cards.evaluateAll(all => all.slice(0, 3).map(card => card.getBoundingClientRect().toJSON() as DOMRect));
    expect(second.y, url).toBe(first.y);
    expect(first.x, url).toBeCloseTo(gridBox.x, 0);
    expect(second.x + second.width, url).toBeCloseTo(gridBox.x + gridBox.width, 0);
    expect(third.y, url).toBeGreaterThan(first.y + first.height);
    expect(await fitsViewport(page), url).toBe(true);
  }
});

test("Desktop viewport sets cards side by side", { tag: "@rule-0031" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const url of cardPages) {
    await page.goto(url);
    const cards = page.locator(".main-group .resource-card");
    await expect(cards.nth(1)).toBeVisible();
    const [first, second] = await boxes(cards);
    expect(first.width, url).toBeLessThan(400);
    expect(second.y, url).toBe(first.y);
    expect(second.x, url).toBeGreaterThan(first.x + first.width);
    if (url === course) await expect(page.locator(".main-group > .ui-panel")).toBeVisible();
  }
  await page.goto("/course/tutors-reference-manual");
  await expect(page.locator(".main-group .unit-panel").first()).toBeVisible();
  await expect(page.locator(".main-group .ui-panel .ui-panel")).toHaveCount(0);
});

test("Small phone viewport gives each card its own row", { tag: "@rule-0059" }, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  for (const url of cardPages) {
    await page.goto(url);
    const grid = page.locator(".main-group .card-grid").first();
    const cards = grid.locator(".resource-card");
    await expect(cards.nth(1)).toBeVisible();
    const gridBox = (await grid.boundingBox())!;
    const [first, second] = await boxes(cards);
    expect(first.width, url).toBeCloseTo(gridBox.width, 0);
    expect(second.y, url).toBeGreaterThan(first.y + first.height);
    expect(await fitsViewport(page), url).toBe(true);
  }
});

test("Standard phone viewport keeps two cards a row", { tag: "@rule-0059" }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(course);
  const cards = page.locator(".main-group .resource-card");
  await expect(cards.nth(1)).toBeVisible();
  const [first, second] = await boxes(cards);
  expect(second.y).toBe(first.y);
});

test("Hovering a card enlarges it", { tag: "@rule-0032" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(typicalTopic);
  const card = cardOfType(page, "lab");
  await card.hover();
  await expect(card).toHaveCSS("transform", "matrix(1.02, 0, 0, 1.02, 0, 0)");
});
