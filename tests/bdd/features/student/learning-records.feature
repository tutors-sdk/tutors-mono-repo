@student
Feature: Learning records in a learning record store
  As a lecturer
  I want students' learning activity stored as xAPI statements in a learning record store we host
  So that progression and badges can be read with standard tools

  Background:
    Given the course "web-dev-101" is published with 2 labs
    And a learning record store accepts statements

  @rule-0076 @ears-event-driven
  Rule: When a signed-in student opens a learning object, tutors shall build an xAPI statement that names the student's GitHub account, the verb experienced, the learning object as the activity and the course as its parent.

    Scenario: Opening a lab builds an experienced statement
      When "alice" opens lab 1
      Then the statement actor should be the GitHub account "alice"
      And the statement verb should be "http://adlnet.gov/expapi/verbs/experienced"
      And the statement activity should be lab 1, typed "http://adlnet.gov/expapi/activities/lesson"
      And the statement parent should be the course "web-dev-101"

  @rule-0077 @ears-event-driven
  Rule: When tutors records a statement for a student who has consented to learning analytics, tutors shall post it to the store's statements resource with the xAPI version header and the store's credentials.

    Scenario: A consenting student's statement reaches the store
      Given "alice" has consented to learning analytics
      When "alice" opens lab 1
      And tutors records the statement
      Then the store should have received 1 statement for "alice"
      And the request should carry the xAPI version "1.0.3" and the store's credentials

  @rule-0078 @ears-unwanted
  Rule: If a student has not consented to learning analytics, then tutors shall not send statements about that student to the learning record store.

    Scenario: A student without consent sends nothing
      Given "bob" has not consented to learning analytics
      When "bob" opens lab 1
      And tutors records the statement
      Then the store should have received no statements
