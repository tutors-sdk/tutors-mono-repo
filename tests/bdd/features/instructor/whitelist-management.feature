@instructor
Feature: Whitelist Management
  As an instructor
  I want to control access to private courses via a whitelist
  So that only authorised students can access restricted content

  @rule-0515 @ears-unwanted
  Rule: If nobody is signed in when a course that requires authentication is opened, then the reader shall send the visitor to sign in and remember the course for afterwards.

    Scenario: Private course requires authentication
      Given the course "secure-101" requires authentication
      And nobody is signed in
      When the course is opened
      Then the system shall require authentication before displaying content, remembering "secure-101" for after sign-in
      And unauthenticated users shall be redirected to the sign-in page "/auth"

  @rule-0516 @ears-event-driven
  Rule: When a signed-in student on a course's whitelist opens the course, the reader shall show its content.

    Scenario: Whitelisted student can access private course
      Given the course "secure-101" requires authentication, with the whitelist "alice, bob" and the educators "lecturer"
      And "Alice" is signed in
      When the course is opened
      Then the system shall grant access to the course content

  @rule-0517 @ears-unwanted
  Rule: If a signed-in student who is not on a course's whitelist opens the course, then the reader shall send them to the home page.

    Scenario: Non-whitelisted student denied access
      Given the course "secure-101" requires authentication, with the whitelist "alice, bob" and the educators "lecturer"
      And "Mallory" is signed in
      When the course is opened
      Then the system shall deny access to the course content by sending the student to "/"

  @rule-0518 @ears-event-driven
  Rule: When an educator of a course opens it, the reader shall show its content whether or not the educator is on the whitelist.

    Scenario: Instructor always has access to their courses
      Given the course "secure-101" requires authentication, with the whitelist "alice, bob" and the educators "lecturer"
      And "Lecturer" is signed in
      When the course is opened
      Then the system shall grant access regardless of whitelist status
