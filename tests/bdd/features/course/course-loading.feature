Feature: Course Loading
  As a student
  I want to load a course from its URL
  So that I can access learning materials

  Background:
    Given a published course "web-dev-101" exists
    And the course has 3 topics with 2 labs each

  Scenario: Successfully load a course
    When I request the course "web-dev-101"
    Then the course should load successfully
    And the course title should be "Web Development 101"
    And the course should have 3 topics

  Scenario: Handle missing course gracefully
    When I request the course "nonexistent-course"
    Then I should see an error message
    And the error should indicate the course was not found

  Scenario: Load a course with nested units
    Given the course has topics with nested units
    When I request the course "web-dev-101"
    Then each topic should contain its units
    And each unit should contain its learning objects

  Scenario Outline: Load different learning object types
    Given a learning object of type "<type>" exists in the course
    When I navigate to the learning object
    Then the learning object should have type "<type>"
    And the learning object should have a valid route

    Examples:
      | type     |
      | lab      |
      | talk     |
      | video    |
      | note     |
      | web      |
      | github   |
      | archive  |
