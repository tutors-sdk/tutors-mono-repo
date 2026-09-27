Feature: Authentication
  As a user
  I want to sign in with my GitHub account
  So that my activity can be tracked and my progress saved

  Background:
    Given the course "web-dev-101" is published with 2 labs

  @rule-0011 @ears-event-driven
  Rule: When a student chooses to sign in from a course, the reader shall start the GitHub sign-in flow, return the student to that course and save the student's record.

    Scenario: Sign in with GitHub OAuth
      Given I am not authenticated
      When I choose to sign in from "/course/web-dev-101"
      Then the reader should start the "github" sign-in flow, returning to "/course/web-dev-101"
      And after authentication as "Alice" the reader should know me by my profile name "Alice"
      And my student record should be saved as "alice" with the name "Alice"

  @rule-0012 @ears-state-driven
  Rule: While a student is signed in, the reader shall record the student's lab visits in the analytics service.

    @active
    Scenario: Track authenticated user activity
      Given I am authenticated as "Alice"
      When I navigate to a lab in "web-dev-101"
      Then my activity should be recorded to the analytics service
      And the record should include my user ID "alice" and the lab route

    @inactive
    Scenario: Anonymous browsing records no activity
      Given I am not authenticated
      When I navigate to a lab in "web-dev-101"
      Then my activity should not be recorded

  @rule-0013 @ears-ubiquitous
  Rule: The reader shall show course content without requiring a student to sign in.

    Scenario: Anonymous browsing
      Given I am not authenticated
      When I navigate to a lab in "web-dev-101"
      Then I should be able to view course content without being sent to sign in
