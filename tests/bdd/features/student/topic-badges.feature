@student
Feature: Topic badges
  As a student
  I want a badge when I work through a whole topic
  So that I can show what I have done anywhere that reads Open Badges

  Background:
    Given the course "web-dev-101" is published with 2 labs in "Topic 1"
    And the institution "SETU Computing" signs badges with the key "did:key:z6MkTutorsTestIssuer"

  @rule-0079 @ears-event-driven
  Rule: When a student has opened every learning object in a topic, tutors shall issue an Open Badges 3.0 credential for that topic, signed by the institution's signing service.

    Scenario: Opening every lab in a topic earns its badge
      Given "alice" has opened labs 1 and 2
      When tutors checks the badge for "Topic 1"
      Then "alice" should receive an OpenBadgeCredential named "Topic 1 (Course web-dev-101)"
      And the credential issuer should be "did:key:z6MkTutorsTestIssuer"
      And the credential should identify the student as "https://github.com/alice"
      And the credential should carry the signing service's proof

  @rule-0080 @ears-unwanted
  Rule: If a student has not opened every learning object in a topic, then tutors shall not issue that topic's badge.

    Scenario: A topic left unfinished earns nothing
      Given "bob" has opened lab 1 only
      When tutors checks the badge for "Topic 1"
      Then no credential should be issued
      And the signing service should not have been called
