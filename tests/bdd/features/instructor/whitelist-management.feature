@instructor @ears-state-driven @ears-unwanted
Feature: Whitelist Management
  As an instructor
  I want to control access to private courses via a whitelist
  So that only authorised students can access restricted content

  @ears-state-driven
  Scenario: Private course requires authentication
    While a course has isPrivate set to true
    Then the system shall require authentication before displaying content
    And unauthenticated users shall be redirected to the sign-in page

  @ears-state-driven
  Scenario: Whitelisted student can access private course
    While a student is authenticated and on the course whitelist
    Then the system shall grant access to the course content

  @ears-unwanted
  Scenario: Non-whitelisted student denied access
    If an authenticated student is not on the course whitelist
    Then the system shall deny access to the course content
    And the system shall display an access denied message

  @ears-unwanted
  Scenario: Whitelist check handles missing data gracefully
    If the whitelist table query returns an error
    Then the system shall deny access by default
    And the system shall log the error for debugging

  @ears-state-driven
  Scenario: Instructor always has access to their courses
    While an instructor is authenticated
    Then the system shall grant access regardless of whitelist status
