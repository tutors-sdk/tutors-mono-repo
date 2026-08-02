@instructor @ears-state-driven @ears-event-driven
Feature: Lab Analytics
  As an instructor
  I want to view lab completion and time-on-task analytics
  So that I can assess student engagement with practical exercises

  @ears-state-driven
  Scenario: View lab completion across students
    While a course has lab learning objects with student records
    Then the system shall display each student's duration per lab
    And records shall be grouped by student

  @ears-event-driven
  Scenario: View per-step lab analytics
    When an instructor drills into a specific lab
    Then the system shall show time spent on each step
    And steps shall be ordered sequentially

  @ears-state-driven
  Scenario: Identify students with low engagement
    While lab records show some students with zero duration
    Then the system shall highlight students who have not started the lab

  @ears-event-driven
  Scenario: Compare lab activity across course
    When an instructor views the lab analytics overview
    Then the system shall show total duration per lab across all students
    And labs shall be sortable by total engagement

  @ears-state-driven
  Scenario: Handle labs with no student activity
    While a lab has been authored but no students have accessed it
    Then the system shall show the lab with zero activity
    And the lab shall still be listed in the analytics view
