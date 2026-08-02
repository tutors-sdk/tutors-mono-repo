Feature: Course Navigation
  As a student
  I want to navigate through course content
  So that I can find and access specific learning materials

  Scenario: Navigate from course to topic
    Given I am viewing the course "web-dev-101"
    When I click on the topic "HTML Fundamentals"
    Then I should see the topic's learning objects
    And the breadcrumb should show "web-dev-101 > HTML Fundamentals"

  Scenario: Navigate from topic to lab
    Given I am viewing the topic "HTML Fundamentals"
    When I click on the lab "First Web Page"
    Then I should see the lab content rendered
    And the breadcrumb should include the lab title

  Scenario: Search for content within a course
    Given I am viewing the course "web-dev-101"
    When I search for "CSS"
    Then I should see matching learning objects
    And results should include the learning object type

  Scenario: Navigate back using breadcrumbs
    Given I am viewing a lab within a topic
    When I click the topic name in the breadcrumb
    Then I should return to the topic view
    And the current learning object should be deselected
