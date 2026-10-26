@student
Feature: Course badges from badges.yaml
  As a lecturer
  I want to define a course's badges in a badges.yaml beside enrollment.yaml
  So that badges are versioned with the course and issued as Open Badges any verifier can check

  Background:
    Given the course "web-dev-101" publishes a topic "topic-0" with 2 labs and 1 note
    And the course's badges.yaml reads:
      """
      - { id: lab-explorer, title: Lab explorer, criteria: { opened-all: { topic: topic-0, type: lab } } }
      - { id: three-days, title: Three days in, criteria: { active-days: 3 } }
      - { id: lab-helper, title: Lab helper, criteria: manual }
      """
    And the institution "SETU Computing" signs badges with the key "did:key:z6MkTutorsTestIssuer"

  @rule-0103 @ears-event-driven
  Rule: When a student meets the criteria of a badge in a course's badges.yaml, tutors shall issue that badge as an Open Badges 3.0 credential signed by the institution's signing service.

    Scenario: Opening every lab in the topic earns the opened-all badge
      Given "alice" has opened labs 1 and 2
      When tutors checks the badge "lab-explorer"
      Then "alice" should receive an OpenBadgeCredential named "Lab explorer (Course web-dev-101)"
      And the credential issuer should be "did:key:z6MkTutorsTestIssuer"
      And the credential should identify the student as "https://github.com/alice"
      And the credential achievement should be "https://tutors.dev/course/web-dev-101/badges/lab-explorer"
      And the credential should carry the signing service's proof

    Scenario: Activity on enough days earns the active-days badge
      Given "alice" was active in the course on "2026-09-20", "2026-09-22" and "2026-09-25"
      When tutors checks the badge "three-days"
      Then "alice" should receive an OpenBadgeCredential named "Three days in (Course web-dev-101)"

  @rule-0104 @ears-unwanted
  Rule: If a student has not met the criteria of a badge in a course's badges.yaml, then tutors shall not issue that badge.

    Scenario: A topic left unfinished earns nothing
      Given "bob" has opened lab 1 only
      When tutors checks the badge "lab-explorer"
      Then no credential should be issued
      And the signing service should not have been called

    Scenario: Too few active days earn nothing
      Given "bob" was active in the course on "2026-09-20" and "2026-09-20"
      When tutors checks the badge "three-days"
      Then no credential should be issued

    Scenario: A manual badge is never issued automatically
      Given "bob" has opened labs 1 and 2
      And "bob" was active in the course on "2026-09-20", "2026-09-22" and "2026-09-25"
      When tutors checks the badge "lab-helper"
      Then no credential should be issued

  @rule-0105 @ears-unwanted
  Rule: If an entry in a course's badges.yaml has no id, has no title, repeats an id or names an unknown criterion, then tutors shall reject the file with an error that names the entry.

    Scenario: An unknown criterion is rejected
      When tutors reads a badges.yaml whose entry 2 has the criteria "{ quiz-score: 80 }"
      Then the file should be rejected with an error naming "entry 2"

    Scenario: A repeated id is rejected
      When tutors reads a badges.yaml whose entry 2 repeats the id "lab-explorer"
      Then the file should be rejected with an error naming "entry 2"
