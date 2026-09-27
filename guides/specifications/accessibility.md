# Accessibility

These scenarios are specification prose, not executed. Each one is a statement about the rendered page: the first focusable element, the landmarks a screen reader finds, the Tab order, focus rings, contrast ratios and `alt` attributes. They only exist once Svelte components have been compiled and rendered in a browser, and Node Vitest has no Svelte compiler and no DOM, so there is no product function to call that decides any of them. Tier G owns the behaviour that is checked today: `tests/e2e-stack/journeys/student.journey.spec.ts` drives the reader, catalogue and live apps by role and accessible name only (so an unlabelled control fails the journey), runs an axe audit with the WCAG 2.0 and 2.1 A and AA tags on every page it visits (`auditAccessibility` in `stack.ts`, serious and critical violations ratcheted against `tests/e2e-stack/a11y-known-violations.txt`), and has two keyboard tests (focus lands in the search box, and route changes move focus to the main content). Those axe tags include image alternative text and colour contrast in the default theme. `tests/e2e/accessibility.spec.ts` (run by `pnpm test:a11y`, not by any CI workflow) adds a dark-mode axe pass that fails on serious or critical violations, and runs axe's best-practice landmark rules but only prints what they find. No tier covers the rest today: the reader has no "Skip to content" link at all (the text appears nowhere under `apps/` or `packages/`; `tests/unit/utils/a11y.test.ts` tests a skip link built inside the test, not product code), nothing walks the full Tab order or asserts a visible focus indicator, nothing names the four landmarks listed here, the product offers no high contrast theme, and nothing distinguishes decorative images from informative ones.

```gherkin
@student @ears-ubiquitous @ears-optional
Feature: Accessibility
  As a student with accessibility needs
  I want the platform to be navigable by keyboard and screen reader
  So that I can access all learning content regardless of ability

  @ears-ubiquitous
  Scenario: Skip to content link
    Given a student navigates to any page
    Then the system shall provide a "Skip to content" link as the first focusable element

  @ears-ubiquitous
  Scenario: Semantic navigation landmarks
    Given a student is viewing a course page
    Then the system shall provide labelled navigation landmarks
    And landmarks shall include main navigation, breadcrumbs, sidebar, and footer

  @ears-ubiquitous
  Scenario: Keyboard navigation through course content
    Given a student is navigating by keyboard
    Then all interactive elements shall be reachable via Tab key
    And the current focus shall be visually indicated

  @ears-optional
  Scenario: High contrast theme support
    Where the student has selected a high contrast theme
    Then the system shall apply sufficient contrast ratios to all text
    And interactive elements shall have visible focus indicators

  @ears-ubiquitous
  Scenario: Images have alternative text
    Given a course contains learning objects with images
    Then each image shall have descriptive alt text
    And decorative images shall have empty alt attributes
```
