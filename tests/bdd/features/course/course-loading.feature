Feature: Course Loading
  As a student
  I want to load a course from its URL
  So that I can access learning materials

  Background:
    Given the generator has published the course "web-dev-101" titled "Web Development 101"
    And the course has 3 topics with 2 labs each

  Scenario: Successfully load a course
    When the reader loads the course
    Then the course title should be "Web Development 101"
    And the course should have 3 topics
    And every learning object should be reachable by its route

  Scenario: Load a course with nested units
    Given the first topic also holds a unit with 2 notes
    When the reader loads the course
    Then the first topic should list that unit
    And each note in the unit should trace its breadcrumbs through the unit and the first topic

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
