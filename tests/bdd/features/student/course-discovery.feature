@student @ears-ubiquitous @ears-event-driven
Feature: Course Discovery
  As a student
  I want to browse and search the course catalogue
  So that I can find courses relevant to my learning goals

  @ears-ubiquitous
  Scenario: Browse available courses in catalogue
    Given the catalogue contains the courses:
      | id          | title           | visits |
      | data-sci    | Data Science    | 45     |
      | draft-notes | Draft Notes     | 3      |
      | web-dev-101 | Web Development | 120    |
    When a student opens the catalogue
    Then the system shall display the courses "Web Development, Data Science"
    And each course shall show its title, summary, image and visit count

  @ears-event-driven
  Scenario: Filter courses by topic
    Given a course has topics "Web Development" and "Data Science"
    When a student filters by topic "Web Development"
    Then the system shall display only the learning objects "Web Development Lab, Setup, Web Development Notes"

  @ears-ubiquitous
  Scenario: View course details
    Given a course "Introduction to Computing" exists
    And its topics "Networks, Hardware, Software" were published with the orders "2, 1, none"
    When a student navigates to the course
    Then the system shall display the course title "Introduction to Computing" and the summary "<p>Introduction to Computing summary</p>"
    And the system shall display the topics in the order "Hardware, Networks, Software"
