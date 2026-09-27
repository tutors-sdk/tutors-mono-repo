@student
Feature: Course Discovery
  As a student
  I want to browse and search the course catalogue
  So that I can find courses relevant to my learning goals

  @rule-0008 @ears-event-driven
  Rule: When a student opens the catalogue, the catalogue shall list the courses with at least 20 visits, most visited first, each with its title, summary, image and visit count.

    Scenario: Browse available courses in catalogue
      Given the catalogue contains the courses:
        | id          | title           | visits |
        | data-sci    | Data Science    | 45     |
        | draft-notes | Draft Notes     | 3      |
        | web-dev-101 | Web Development | 120    |
      When a student opens the catalogue
      Then the catalogue shall display the courses "Web Development, Data Science"
      And each course shall show its title, summary, image and visit count

  @rule-0009 @ears-event-driven
  Rule: When a student filters a course by topic, the reader shall show only the learning objects of that topic.

    Scenario: Filter courses by topic
      Given a course has topics "Web Development" and "Data Science"
      When a student filters by topic "Web Development"
      Then the reader shall display only the learning objects "Web Development Lab, Setup, Web Development Notes"

  @rule-0010 @ears-event-driven
  Rule: When a student opens a course, the reader shall display its title, its summary and its topics in their published order.

    Scenario: View course details
      Given a course "Introduction to Computing" exists
      And its topics "Networks, Hardware, Software" were published with the orders "2, 1, none"
      When a student navigates to the course
      Then the reader shall display the course title "Introduction to Computing" and the summary "<p>Introduction to Computing summary</p>"
      And the reader shall display the topics in the order "Hardware, Networks, Software"
