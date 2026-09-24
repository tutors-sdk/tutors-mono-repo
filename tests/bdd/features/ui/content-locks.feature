@ui @reader
Feature: Content locks
  As a lecturer
  I want to lock resources until students should open them
  So that students cannot open them early, and only see them coming if I choose

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0052 @ears-state-driven
  Rule: While a resource is locked, the reader shall leave it out of a student's cards, course tree, search results and LLM export.

    @active
    Scenario: Locked resource is hidden from a student's cards
      Given the lecturer has locked a topic of an enrolled course
      When a student opens the course
      Then that topic has no card, and the topic count leaves it out

    @active
    Scenario: Locked resource is left out of the course tree
      Given the lecturer has locked a topic of an enrolled course
      When a student opens the course tree
      Then that topic is not in the tree

    @active
    Scenario: Locked resource is left out of search results
      Given the lecturer has locked a topic of an enrolled course
      When a student searches for a word that only that topic's talk contains
      Then neither the search dialog nor the search page lists it
      And a lecturer's search still finds it

    @active
    Scenario: Locked resource is left out of the LLM export
      Given the lecturer has locked a topic of an enrolled course
      When a student opens the course's LLM version
      Then that topic is not listed

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

  @rule-0054 @ears-optional
  Rule: Where a lecturer has chosen to show locked content to students, the reader shall show each locked card to a student greyed out, labelled "Locked" and without a link.

    @active
    Scenario: Locked card is greyed out for a student
      Given the lecturer has locked a topic and turned on "Show locked content to students"
      When a student opens the course
      Then that card is greyed out, labelled "Locked", and has no link to open

    @inactive
    Scenario: Without the setting a locked card stays hidden
      Given the lecturer has locked a topic and left "Show locked content to students" off
      When a student opens the course
      Then that topic has no card
