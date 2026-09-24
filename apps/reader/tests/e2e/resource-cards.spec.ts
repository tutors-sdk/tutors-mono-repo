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
    await expect(card.locator(".resource-heading")).toBeVisible();
    expect((await card.locator(".lo-artwork").boundingBox())!.width).toBeGreaterThanOrEqual(64);
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

test("Phone viewport stacks cards in one column", { tag: "@rule-0031" }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of cardPages) {
    await page.goto(url);
    const cards = page.locator(".main-group .resource-card");
    await expect(cards.nth(1)).toBeVisible();
    const [first, second] = await boxes(cards);
    expect(second.y, url).toBeGreaterThan(first.y + first.height);
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
  }
});

test("Phone cards fill the width with artwork beside the text", { tag: "@rule-0059" }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of cardPages) {
    await page.goto(url);
    const grid = page.locator(".main-group .card-grid").first();
    const card = grid.locator(".resource-card").first();
    await expect(card).toBeVisible();
    expect((await card.boundingBox())!.width, url).toBeCloseTo((await grid.boundingBox())!.width, 0);
    const artwork = (await card.locator(".lo-artwork").boundingBox())!;
    const heading = (await card.locator(".resource-heading").boundingBox())!;
    expect(artwork.x + artwork.width, url).toBeLessThanOrEqual(heading.x);
  }
});

test("Desktop cards keep their fixed width", { tag: "@rule-0059" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(typicalTopic);
  const card = cardOfType(page, "lab");
  await expect(card).toBeVisible();
  const cardBox = (await card.boundingBox())!;
  const heading = (await card.locator(".resource-heading").boundingBox())!;
  const artwork = (await card.locator(".lo-artwork").boundingBox())!;
  expect(cardBox.width).toBeCloseTo(220, 0);
  expect(heading.y + heading.height).toBeLessThanOrEqual(artwork.y);
  expect(Math.abs(artwork.x + artwork.width / 2 - cardBox.x - cardBox.width / 2)).toBeLessThan(1);
});

test("Hovering a card enlarges it", { tag: "@rule-0032" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(typicalTopic);
  const card = cardOfType(page, "lab");
  await card.hover();
  await expect(card).toHaveCSS("transform", "matrix(1.02, 0, 0, 1.02, 0, 0)");
});
