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

  @rule-0605 @ears-unwanted
  Rule: If a signed-in student on neither the whitelist nor the educators of a private course opens it, then the reader shall leave that course out of the student's Recently accessed courses.

    Scenario: A student turned away from a private course does not see it in Recently accessed
      Given the private course "secure-101", with the whitelist "alice, bob" and the educators "lecturer"
      And "Mallory" is signed in
      When the course is opened
      Then the student is sent to "/"
      And "secure-101" is not among the student's Recently accessed courses

    Scenario: A whitelisted student sees the private course in Recently accessed
      Given the private course "secure-101", with the whitelist "alice, bob" and the educators "lecturer"
      And "Alice" is signed in
      When the course is opened
      Then "secure-101" is among the student's Recently accessed courses
