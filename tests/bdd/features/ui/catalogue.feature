@ui @catalogue
Feature: Catalogue shell
  As a visitor browsing the catalogue with a screen reader
  I want every link in the catalogue's header to say where it goes
  So that I can tell the links apart by name

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/catalogue/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0173 @ears-ubiquitous
  Rule: The catalogue shall give each link in its header an accessible name that no other link in the header has.

    Scenario: Catalogue header links have distinct names
      When a visitor opens the catalogue
      Then no two links in the header share an accessible name
      And the Tutors logo link is named "Tutors home"
