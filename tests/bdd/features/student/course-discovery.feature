@student @ears-ubiquitous @ears-event-driven
Feature: Course Discovery
  As a student
  I want to browse and search the course catalogue
  So that I can find courses relevant to my learning goals

  @ears-ubiquitous
  Scenario: Browse available courses in catalogue
    Given the catalogue contains multiple courses
    Then the system shall display all public courses
    And each course shall show its title, summary and image

  @ears-event-driven
  Scenario: Search for a course by keyword
    When a student searches for "programming"
    Then the system shall return courses matching the search term
    And results shall be ordered by relevance

  @ears-event-driven
  Scenario: Filter courses by topic
    Given a course has topics "Web Development" and "Data Science"
    When a student filters by topic "Web Development"
    Then the system shall display only learning objects under that topic

  @ears-ubiquitous
  Scenario: View course details
    Given a course "Introduction to Computing" exists
    When a student navigates to the course
    Then the system shall display the course title and summary
    And the system shall display all topics in order

  @ears-event-driven
  Scenario: Navigate from catalogue to course reader
    Given a student is viewing the course catalogue
    When the student clicks on a course card
    Then the system shall navigate to the course reader for that course
