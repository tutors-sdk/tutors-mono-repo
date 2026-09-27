@ui @reader
Feature: Searching a course
  As a student
  I want search to find what I mean and take me to it
  So that I can get to the right line of a lab or note quickly

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0056 @ears-event-driven
  Rule: When a student searches with more than one word, the reader shall list the resources that contain every word, in any order and anywhere in their text.

    Scenario: Search matches every word, not the exact phrase
      When a student searches the Reference Course for two words that appear apart in a note
      Then that note is listed
      And a word no resource contains, added to the search, leaves no results

  @rule-0057 @ears-event-driven
  Rule: When a student searches a course, the reader shall list resources whose title matches before those that match only in their summary or text.

    Scenario: Title matches come first
      When a student searches the Reference Course for a word that is a topic's title and also appears in other resources' text
      Then the resource with that title is listed first

  @rule-0058 @ears-event-driven
  Rule: When a student opens a search result, the reader shall scroll to the first match in its content and highlight every search word on the page.

    Scenario: Opening a result scrolls to the highlighted match
      When a student searches for a phrase that appears far down a note and opens the result
      Then the note opens scrolled to that phrase
      And the search words are highlighted on the page

  @rule-0060 @ears-optional
  Rule: Where the device has no mouse or trackpad, the reader shall show no keyboard shortcut hints.

    @active
    Scenario: Touch screens show no keyboard hints
      Given a touch phone
      When a student opens the course home and the search dialog
      Then no keyboard shortcut hint is visible
      And the search dialog closes from its Close button

    @inactive
    Scenario: Desktop header shows the search shortcut
      Given a desktop with a mouse
      When a student opens the course home
      Then the search button shows its keyboard shortcut
