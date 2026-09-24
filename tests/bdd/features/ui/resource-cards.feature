@ui @reader
Feature: Resource cards
  As a student
  I want every resource to appear as a consistent card
  So that I can tell resource types apart and scan a topic at a glance

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0029 @ears-ubiquitous
  Rule: The reader shall show each resource as a card with its title and type icon above its artwork and its summary below, tinted and bordered in its type's colour.

    Scenario: Cards show title, artwork and type colour
      When a student opens a topic with labs and talks
      Then each card's heading sits above artwork at least 80 pixels wide, centred in the card
      And a lab card and a talk card have different tints
      And each card's type icon has its card's border colour

  @rule-0030 @ears-ubiquitous
  Rule: The reader shall give every card in a card grid the height of the tallest card in that grid.

    Scenario: Cards in a grid share the tallest height
      When a student opens a topic whose cards have summaries of different lengths
      Then every card in the grid has the same height

  @rule-0031 @ears-state-driven
  Rule: While the viewport is narrower than 768 pixels, the reader shall show resource cards in a single column.

    @active
    Scenario: Phone viewport stacks cards in one column
      Given the viewport is 390 pixels wide
      When a student opens the course home and a topic
      Then each card starts below the one before it

    @inactive
    Scenario: Desktop viewport sets cards side by side
      Given the viewport is 1440 pixels wide
      When a student opens the course home and a topic
      Then the first two cards share a row and each is narrower than 400 pixels

  @rule-0032 @ears-event-driven
  Rule: When a pointer rests on a card, the reader shall enlarge the card to 102 percent of its size.

    Scenario: Hovering a card enlarges it
      When a student points at a resource card
      Then the card is scaled to 1.02
