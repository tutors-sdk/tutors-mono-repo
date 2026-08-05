@student @ears-state-driven @ears-event-driven
Feature: Learning Progress Tracking
  As a student
  I want to track my learning progress through courses
  So that I can monitor my engagement and identify areas needing attention

  @ears-state-driven
  Scenario: View time spent on a course
    While the student is authenticated and has accessed course materials
    Then the system shall display total time active for the course
    And time shall be displayed in hours and minutes

  @ears-event-driven
  Scenario: Record learning activity
    When a student views a learning object
    Then the system shall record the time active
    And the system shall increment the page load count

  @ears-state-driven
  Scenario: Resume from last accessed position
    While the student has previously accessed a course
    Then the system shall display recently accessed courses on the dashboard
    And each entry shall show the last accessed date

  @ears-event-driven
  Scenario: Star a favourite course
    When a student stars a course
    Then the system shall add it to the favourites list
    And the course shall appear in the favourites section on the home page

  @ears-state-driven
  Scenario: View learning records per learning object
    While the student has interacted with multiple learning objects
    Then the system shall track duration and page loads per learning object
    And records shall be grouped by course
