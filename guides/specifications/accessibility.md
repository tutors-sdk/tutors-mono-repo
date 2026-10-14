# Accessibility

These scenarios are specification prose, not executed; the behaviour checked today is in other features. `tests/bdd/features/ui/accessibility.feature` is bound: each of its Rules (0051, 0216, 0170, 0171, 0172) is proved by a Playwright test of the same title in `apps/reader/tests/e2e/accessibility.spec.ts`, run in CI by `pnpm test:e2e:reader`. Those tests run axe with the WCAG 2.0 and 2.1 A and AA tags on course, topic, note and sign-in pages, in light and dark appearance and the Dyslexia theme, and fail on serious or critical violations; they also check that every named landmark has a distinct name, that the site footer is a contentinfo landmark outside main, and that the search results list is named apart from its dialog. Tier G (`tests/e2e-stack/journeys/student.journey.spec.ts`) drives the reader, catalogue and live apps by role and accessible name only, runs the same axe tags on every page it visits (`auditAccessibility` in `stack.ts`, ratcheted against `tests/e2e-stack/a11y-known-violations.txt`), and has two keyboard tests (focus lands in the search box, and route changes move focus to the main content). The reader shell now renders a "Skip to content" link to `#main-content` (`packages/adapters/driving/ui-navigators/src/TutorsShell.svelte`), but no test asserts it is the first focusable element. No tier covers the rest today: nothing walks the full Tab order or asserts a visible focus indicator, the product offers no high contrast theme, and nothing distinguishes decorative images from informative ones.

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
