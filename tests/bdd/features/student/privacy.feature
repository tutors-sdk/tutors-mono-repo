@student
Feature: Privacy choices
  As a student
  I want to decide what Tutors records about me, and to see what it holds
  So that my learning activity and presence are shared only with my consent

  Background:
    Given the course "web-dev-101" is published with 2 labs

  @rule-0065 @ears-state-driven
  Rule: While a signed-in student has not allowed learning analytics, the reader shall store none of that student's page loads or time active.

    @active
    Scenario: A student who has not chosen yet is not tracked
      Given the student "Alice" signs in without having made a privacy choice
      When the student views lab 1 of the course and stays for 60 seconds
      Then the reader shall store no learning records and no calendar time for "alice"

    @active
    Scenario: Turning learning analytics off stops the tracking
      Given the student "Alice" signs in having allowed learning analytics and presence sharing
      And the student turns learning analytics off
      When the student views lab 1 of the course and stays for 60 seconds
      Then the reader shall store no learning records and no calendar time for "alice"

    @inactive
    Scenario: A student who allowed learning analytics is tracked
      Given the student "Alice" signs in having allowed learning analytics only
      When the student views lab 1 of the course and stays for 60 seconds
      Then the reader shall store 1 page load and 2 blocks of time active for "alice"

  @rule-0066 @ears-state-driven
  Rule: While a signed-in student has not allowed presence sharing, the reader shall neither broadcast that student's activity nor mark that student online.

    @active
    Scenario: A student who has not chosen yet is not broadcast
      Given the student "Alice" signs in without having made a privacy choice
      When the student views lab 1 of the course
      Then the reader shall broadcast nothing and save no latest activity for "alice"
      And the reader shall mark "alice" as "offline"

    @inactive
    Scenario: A student who allowed presence sharing is broadcast
      Given the student "Alice" signs in having allowed presence sharing only
      When the student views lab 1 of the course
      Then the reader shall broadcast the visit to lab 1 and save it as the latest activity of "alice"
      And the reader shall mark "alice" as "online"

  @rule-0067 @ears-event-driven
  Rule: When a student saves privacy choices, the reader shall apply them to that student's GitHub login alone.

    Scenario: A second student on the same browser starts with nothing allowed
      Given the student "Alice" signs in without having made a privacy choice
      And the student allows learning analytics and presence sharing
      When "Alice" signs out and the student "Bob" signs in on the same browser
      Then "Bob" shall have made no privacy choice
      And viewing lab 1 of the course shall store no learning records for "bob"

    Scenario: A student's choices return when they sign in again
      Given the student "Alice" signs in without having made a privacy choice
      And the student allows learning analytics only
      When "Alice" signs out and signs in again on the same browser
      Then "Alice" shall have allowed learning analytics and not presence sharing

  @rule-0068 @ears-event-driven
  Rule: When a signed-in student downloads their data, the reader shall return a file holding that student's identity, course history, learning records, calendar time and latest activity, and no other student's records.

    Scenario: Download my data
      Given "alice" and "bob" each have an identity, a course history, learning records, calendar time and a latest activity
      When "alice" downloads their data
      Then the download shall be a JSON attachment named "tutors-data-alice.json"
      And it shall hold the identity, course history, learning records, calendar time and latest activity of "alice"
      And it shall hold no record of "bob"

    Scenario: A student cannot download another student's data
      Given "alice" and "bob" each have an identity, a course history, learning records, calendar time and a latest activity
      When "bob" downloads their data asking for the records of "alice"
      Then it shall hold no record of "alice"

  @rule-0069 @ears-unwanted
  Rule: If a request for a student's data carries no signed-in session, then the reader shall refuse it with status 401.

    Scenario: Download without signing in
      Given "alice" and "bob" each have an identity, a course history, learning records, calendar time and a latest activity
      When someone who is not signed in asks for the records of "alice"
      Then the reader shall answer with status 401 and no records
