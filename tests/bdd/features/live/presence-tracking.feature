Feature: Presence Tracking
  As an instructor
  I want to see which students are currently active
  So that I can monitor engagement in real time

  @rule-0519 @ears-event-driven
  Rule: When students come online, the live dashboard shall show one card per course they are on and the number of students active.

    Scenario: Display courses with active students
      Given I am viewing the live dashboard
      When 3 students come online across the courses "web-dev-101, databases-101"
      Then I should see 2 course cards, for "web-dev-101, databases-101"
      And the dashboard should count 3 active students

  @rule-0520 @ears-event-driven
  Rule: When a student becomes active on a course, the live dashboard shall list the student with their avatar on that course's view.

    Scenario: Display individual student on a course
      Given I am viewing the course detail for "web-dev-101"
      When a student "Alice" becomes active on "web-dev-101"
      Then I should see "Alice" in the active students list
      And I should see their avatar "https://avatars.example/alice.png"
