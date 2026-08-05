Feature: Authentication
  As a user
  I want to sign in with my GitHub account
  So that my activity can be tracked and my progress saved

  Scenario: Sign in with GitHub OAuth
    Given I am not authenticated
    When I click the sign-in button
    Then I should be redirected to GitHub for authentication
    And after authentication I should see my profile name

  Scenario: View profile information
    Given I am authenticated as "Alice"
    When I view my profile
    Then I should see my GitHub avatar
    And I should see my display name "Alice"

  Scenario: Anonymous browsing
    Given I am not authenticated
    When I navigate to a course
    Then I should be able to view course content
    But my activity should not be recorded

  Scenario: Track authenticated user activity
    Given I am authenticated as "Alice"
    When I navigate to a lab in "web-dev-101"
    Then my activity should be recorded to the analytics service
    And the record should include my user ID and the lab route
