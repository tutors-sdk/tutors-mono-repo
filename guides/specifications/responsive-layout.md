# Responsive Layout

These scenarios are specification prose, not executed. They are statements about what is laid out at a viewport width: which navigation is visible at 1280 pixels, what collapses below 768, how a card grid reflows, how large a touch target is. That behaviour lives in Tailwind breakpoint classes inside Svelte components and only exists once a browser has applied CSS at a real viewport size; Node Vitest has no Svelte compiler, no layout engine and no viewport, and there is no product function to call that decides any of it. Tier G is the nearest owner: `playwright.e2e-stack.config.ts` runs the journeys in `tests/e2e-stack/journeys` on desktop Chromium and WebKit on every pull request and on desktop Firefox and a Pixel 7 `mobile` project nightly, with an axe audit on each page, and `labSteps()` in `journeys.ts` requires the "Lab steps" navigation that is visible at the current viewport (the sidebar on desktop, the bottom bar on mobile). So the journeys prove the reader is usable at both sizes. No tier asserts the specifics written here today: nothing checks that a sidebar is shown at 1280 pixels or collapsed behind a hamburger menu below 768, nothing checks that course cards reflow to a single column, nothing measures touch target size (the axe run uses the WCAG 2.0 and 2.1 A and AA tags, and the target size rule belongs to 2.2), and the product has no swipe gesture for lab steps at all (lab steps advance by link or arrow key), so that clause describes behaviour that does not exist.

```gherkin
@shared @ears-ubiquitous @ears-optional
Feature: Responsive Layout
  As any user on any device
  I want the interface to adapt to my screen size
  So that I can use the platform on mobile, tablet and desktop

  @ears-ubiquitous
  Scenario: Desktop layout shows sidebar
    Given the viewport width is 1280 pixels or wider
    Then the system shall display the sidebar navigation
    And course content shall occupy the remaining space

  @ears-ubiquitous
  Scenario: Mobile layout hides sidebar
    Given the viewport width is less than 768 pixels
    Then the system shall collapse the sidebar
    And the system shall provide a hamburger menu to toggle it

  @ears-ubiquitous
  Scenario: Course cards reflow on narrow screens
    Given the viewport width changes from desktop to mobile
    Then course cards shall reflow from a grid to a single column

  @ears-optional
  Scenario: Touch-friendly interaction targets
    Where the device supports touch input
    Then interactive elements shall have a minimum touch target size
    And swipe gestures shall be supported for lab step navigation
```
