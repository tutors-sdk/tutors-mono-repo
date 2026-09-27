@instructor @ears-state-driven @ears-unwanted
Feature: Whitelist Management
  As an instructor
  I want to control access to private courses via a whitelist
  So that only authorised students can access restricted content

  @ears-state-driven
  Scenario: Private course requires authentication
    Given the course "secure-101" requires authentication
    And nobody is signed in
    When the course is opened
    Then the system shall require authentication before displaying content, remembering "secure-101" for after sign-in
    And unauthenticated users shall be redirected to the sign-in page "/auth"

  @ears-state-driven
  Scenario: Whitelisted student can access private course
    Given the course "secure-101" requires authentication, with the whitelist "alice, bob" and the educators "lecturer"
    And "Alice" is signed in
    When the course is opened
    Then the system shall grant access to the course content

  @ears-unwanted
  Scenario: Non-whitelisted student denied access
    Given the course "secure-101" requires authentication, with the whitelist "alice, bob" and the educators "lecturer"
    And "Mallory" is signed in
    When the course is opened
    Then the system shall deny access to the course content by sending the student to "/"

  @ears-state-driven
  Scenario: Instructor always has access to their courses
    Given the course "secure-101" requires authentication, with the whitelist "alice, bob" and the educators "lecturer"
    And "Lecturer" is signed in
    When the course is opened
    Then the system shall grant access regardless of whitelist status
