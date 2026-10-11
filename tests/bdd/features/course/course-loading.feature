Feature: Course Loading
  As a student
  I want to load a course from its URL
  So that I can access learning materials

  Background:
    Given the generator has published the course "web-dev-101" titled "Web Development 101"
    And the course has 3 topics with 2 labs each

  @rule-0001 @ears-event-driven
  Rule: When a student opens a course, the reader shall load the course title, its topics and a route for every learning object.

    Scenario: Successfully load a course
      When the reader loads the course
      Then the course title should be "Web Development 101"
      And the course should have 3 topics
      And every learning object should be reachable by its route

  @rule-0002 @ears-event-driven
  Rule: When a student opens a course whose topic holds a unit, the reader shall list the unit under the topic and trace the breadcrumbs of its learning objects through both.

    Scenario: Load a course with nested units
      Given the first topic also holds a unit with 2 notes
      When the reader loads the course
      Then the first topic should list that unit
      And each note in the unit should trace its breadcrumbs through the unit and the first topic

  @rule-0003 @ears-event-driven
  Rule: When a student opens a course holding a learning object of any published type, the reader shall keep that type and replace the course URL placeholder in its route.

    Scenario Outline: Load different learning object types
      Given the first topic also holds a learning object of type "<type>"
      When the reader loads the course
      Then the first topic should hold a learning object of type "<type>"
      And no route in the course should carry an unresolved course placeholder

      Examples:
        | type    |
        | lab     |
        | talk    |
        | note    |
        | web     |
        | github  |
        | archive |

  # Issue #427. The Calendar button is drawn from the calendar the reader loads (CalendarButton.svelte),
  # so a course the reader gives no calendar shows no button.
  @rule-0284 @ears-optional
  Rule: Where a course's calendar.yaml lists at least one week, the reader shall load that course's calendar.

    @active
    Scenario: A calendar with weeks is loaded
      Given the course has a calendar.yaml titled "Semester 1" with 2 weeks
      When the reader loads the course
      Then the course should have the calendar "Semester 1" with 2 weeks

    @inactive
    Scenario: A course with no calendar.yaml has no calendar
      When the reader loads the course
      Then the course should have no calendar

    @inactive
    Scenario: A calendar.yaml with no weeks has no calendar
      Given the course has a calendar.yaml titled "Semester 1" with 0 weeks
      When the reader loads the course
      Then the course should have no calendar
