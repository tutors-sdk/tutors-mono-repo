Feature: Course Navigation
  As a student
  I want to navigate through course content
  So that I can find and access specific learning materials

  Background:
    Given the generator has published the course "web-dev-101" titled "Web Development 101"
    And the topic "HTML Fundamentals" holds the lab "First Web Page" and the note "HTML Reference"
    And the next topic "Styling" holds the lab "CSS Layout" and the note "CSS Reference"
    And the reader has loaded the course

  @rule-0004 @ears-event-driven
  Rule: When a student follows a topic route, the reader shall show that topic with its learning objects and its breadcrumb trail.

    Scenario: Navigate from course to topic
      When I follow the route "/topic/web-dev-101/topic-0"
      Then I should arrive at the topic "HTML Fundamentals"
      And the topic should list the learning objects "First Web Page, HTML Reference"
      And the breadcrumb should show "Web Development 101 > HTML Fundamentals"

  @rule-0005 @ears-event-driven
  Rule: When a student follows a lab route, the reader shall show that lab with its first step and its breadcrumb trail.

    Scenario: Navigate from topic to lab
      When I follow the route "/lab/web-dev-101/topic-0/lab-0"
      Then I should arrive at the lab "First Web Page"
      And the first lab step should be rendered with the heading "Build First Web Page"
      And the breadcrumb should show "Web Development 101 > HTML Fundamentals > First Web Page"

  @rule-0006 @ears-event-driven
  Rule: When a student searches within a course, the reader shall list each matching learning object with its title and type.

    Scenario: Search for content within a course
      When I search for "CSS"
      Then I should see 2 matching learning objects
      And the results should be titled "CSS Layout/Build, Styling/CSS Reference"
      And the results should carry the learning object types "step, note"

  @rule-0007 @ears-event-driven
  Rule: When a student follows a breadcrumb, the reader shall show the topic that the breadcrumb names with its learning objects.

    Scenario: Navigate back using breadcrumbs
      Given I am viewing the lab "CSS Layout"
      When I follow the breadcrumb "Styling"
      Then I should arrive at the topic "Styling"
      And the topic should list the learning objects "CSS Layout, CSS Reference"
