@student
Feature: Bad rules

  @ears-ubiquitous
  Rule: The catalogue shall list courses.
    Scenario: no id
      Then it lists

  @rule-12 @ears-ubiquitous
  Rule: The catalogue shall list courses with a short id.
    Scenario: malformed id
      Then it lists

  @rule-0801 @ears-ubiquitous
  Rule: The catalogue shall list courses that duplicate an id.
    Scenario: duplicate one
      Then it lists

  @rule-0801 @ears-ubiquitous
  Rule: The catalogue shall show a course image, duplicating an id.
    Scenario: duplicate two
      Then it shows

  @rule-0900 @ears-ubiquitous
  Rule: The catalogue shall list courses and shall show their images.
    Scenario: two shalls
      Then it lists

  @rule-0901 @ears-ubiquitous
  Rule: The catalogue should list courses.
    Scenario: wrong keyword
      Then it lists

  @rule-0902 @ears-ubiquitous
  Rule: The catalogue shall list courses quickly and appropriately.
    Scenario: vague
      Then it lists

  @rule-0903 @ears-ubiquitous
  Rule: The system shall list courses.
    Scenario: no system name
      Then it lists

  @rule-0904 @ears-event-driven
  Rule: When a student searches the reader shall list matches.
    Scenario: no comma
      Then it lists

  @rule-0905 @ears-unwanted
  Rule: If the host is down the reader shall show a retry message.
    Scenario: no then
      Then it shows

  @rule-0906
  Rule: The reader shall list matches.
    Scenario: no ears tag
      Then it lists

  @rule-0907 @ears-event-driven
  Rule: While a student is signed in, tutors shall record activity.
    @active
    Scenario: tag mismatch
      Then it records

    @inactive
    Scenario: tag mismatch, inactive
      Then it does not record

  @rule-0908 @ears-ubiquitous
  Rule: The reader shall list matches without proof.

  @rule-0909 @ears-state-driven
  Rule: While a student is signed in, tutors shall record activity with one scenario.
    Scenario: only active, untagged
      Then it records
