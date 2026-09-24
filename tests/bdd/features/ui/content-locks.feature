@ui @reader
Feature: Content locks
  As a lecturer
  I want to lock resources until students should open them
  So that students see what is coming but cannot open it early

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0052 @ears-state-driven
  Rule: While a resource is locked, the reader shall show its card to a student greyed out, labelled "Locked" and without a link.

    @active
    Scenario: Locked card is greyed out for a student
      Given a signed-in student is viewing a topic
      When the lecturer has locked one of its resources
      Then that card is greyed out, labelled "Locked", and has no link to open

    @inactive
    Scenario: Unlocked card opens for a student
      Given a signed-in student is viewing a topic with nothing locked
      Then every card is in full colour and links to its resource

  @rule-0053 @ears-event-driven
  Rule: When a lecturer locks a resource from the lecturer panel, the reader shall grey out its card and offer an Unlock button on it.

    Scenario: Locking greys the card out and Unlock restores it
      Given a lecturer is viewing a topic
      When the lecturer locks one of its resources in the Content Locks tab
      Then that card is greyed out with an "Unlock" button
      And selecting "Unlock" returns the card to full colour
