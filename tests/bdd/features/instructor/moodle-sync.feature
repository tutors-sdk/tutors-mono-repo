@instructor @reader
Feature: Moodle sync is for a course's educators
  As an educator
  I want to copy my course's Moodle assignments into Tutors Time from Educator Control
  So that I can see who has submitted, without anyone else being able to run the sync

  The sync used to be an open route on the time app. It now lives in the reader, behind the same
  server-side educator check as the enrollment export, and runs before Moodle is contacted.

  Background:
    Given "pf1" publishes an enrollment with "lecturer" as educator
    And Moodle course 1234 has assignment 11 "Lab report" with one submission from Moodle user 42

  @rule-0633 @ears-event-driven
  Rule: When a course educator syncs a Moodle course, the data API shall copy that course's Moodle assignments and submissions into the tables Tutors Time reads.

    Scenario: An educator's sync copies assignments and submissions
      When "lecturer" syncs Moodle course "1234"
      Then the sync shall succeed
      And assignment 11 "Lab report" shall be saved for course "pf1"
      And a submission from Moodle user 42 shall be saved for assignment 11

    Scenario: A course opened from its full Netlify URL is saved under its site name
      Given the reader opened the course from its full URL as "https://pf1"
      When "lecturer" syncs Moodle course "1234"
      Then the sync shall succeed
      And assignment 11 "Lab report" shall be saved for course "pf1"

  @rule-0634 @ears-unwanted
  Rule: If the requester is not a verified educator of the published course, or the Moodle ids are not positive whole numbers, then the data API shall refuse the Moodle sync without contacting Moodle.

    Scenario Outline: A student or visitor cannot run the sync
      When "<login>" syncs Moodle course "1234"
      Then the sync shall fail with status <status>
      And Moodle shall not have been contacted
      And nothing shall have been written

      Examples:
        | login     | status |
        | anonymous | 401    |
        | student   | 403    |

    Scenario: A Moodle course id that is not a positive whole number is refused
      When "lecturer" syncs Moodle course "-3"
      Then the sync shall fail with status 400
      And Moodle shall not have been contacted
      And nothing shall have been written
