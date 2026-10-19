@instructor @reader
Feature: Export course enrollment
  As an educator
  I want a draft enrollment file from recorded course visitors
  So that I do not have to collect every GitHub username by hand

  Background:
    Given "pf1" publishes an enrollment with "lecturer" as educator

  @rule-0371 @ears-event-driven
  Rule: When a course educator exports enrollment, the data API shall download a draft enrollment.yaml containing each recorded course visitor once and preserving existing enrollment entries.

    Scenario: Export adds visitors and preserves manually entered details
      Given the enrollment already lists "Alice" as "Alice from the class list" and whitelists "absent"
      And the recorded visitors are "alice, bob, bob, lecturer"
      And "outsider" has activity only in another course
      And GitHub names include "alice" as "Different GitHub name" and "bob" as "Bob: #1"
      When "lecturer" requests the enrollment export
      Then the download shall preserve the educators, whitelist and named entries
      And the new student shall have the literal name "Bob: #1" and id "bob"
      And the draft shall exclude educators and visitors of other courses from new student entries
      And the download shall be private and named "enrollment.yaml"
      And the export shall not write to the database

    Scenario: Missing names fall back to GitHub usernames
      Given the recorded visitors are "alice, bob"
      When "LECTURER" requests the enrollment export
      Then the student names shall be "alice, bob"

    Scenario: A course with no recorded activity still has a valid draft
      When "lecturer" requests the enrollment export
      Then the draft shall contain empty student and whitelist arrays

    Scenario: A full cohort is exported across database pages
      Given 150 students have 5 days of recorded course activity
      When "lecturer" requests the enrollment export
      Then all 150 students shall appear once with their GitHub names
      And every database page shall have been read

  @rule-0372 @ears-unwanted
  Rule: If the requester is not a verified educator of the published course, then the data API shall reject the enrollment export before reading student data.

    Scenario Outline: A visitor cannot export another course's students
      When "<login>" requests the enrollment export
      Then the export shall fail with status "<status>"
      And no student data shall have been read

      Examples:
        | login     | status |
        | anonymous | 401    |
        | student   | 403    |

    Scenario: A course cannot choose a different course's activity
      Given the published course claims the course id "other-course"
      And "outsider" has activity only in another course
      When "lecturer" requests the enrollment export
      Then the draft shall contain empty student and whitelist arrays

  @rule-0373 @ears-unwanted
  Rule: If the published enrollment or student data cannot be read, then the data API shall fail the export without a partial download.

    Scenario Outline: Failed dependencies produce no enrollment file
      Given the "<dependency>" cannot be read
      When "lecturer" requests the enrollment export
      Then the export shall fail with status 502

      Examples:
        | dependency |
        | course     |
        | enrollment |
        | activity   |
        | names      |

  @rule-0374 @ears-unwanted
  Rule: If an export request supplies a course identifier other than a Netlify site name, then the data API shall reject it before fetching course content.

    Scenario Outline: Untrusted course URLs are not fetched by the server
      Given the export targets "<course>"
      When "lecturer" requests the enrollment export
      Then the export shall fail with status 400
      And no external fetch shall have been made

      Examples:
        | course               |
        | localhost:5432       |
        | 127.0.0.1            |
        | host.example/path    |
        | alice@host.example   |
        | https://host.example |
