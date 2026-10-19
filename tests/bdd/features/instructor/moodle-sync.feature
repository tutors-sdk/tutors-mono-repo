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

  @rule-0651 @ears-unwanted
  Rule: If a Moodle sync fails before every assignment, submission and the sync's completion time is saved, then the data API shall report the sync as failed and run the next sync request for that course without waiting for the sync interval.

    Scenario Outline: A sync that fails part way can be retried at once
      Given Moodle course 1234 also has assignment 12 "Project" with one submission from Moodle user 43
      And <failing step> fails
      When "lecturer" syncs Moodle course "1234" at "2026-10-19T09:00:00Z"
      Then the sync shall fail with status 502
      And no completed sync shall be recorded for course "pf1"
      Given the failure has cleared
      When "lecturer" syncs Moodle course "1234" again at "2026-10-19T09:01:00Z"
      Then the sync shall succeed
      And Moodle shall have been contacted again
      And a submission from Moodle user 43 shall be saved for assignment 12

      Examples:
        | failing step                             |
        | fetching submissions from Moodle         |
        | saving the submissions for assignment 12 |
        | saving the assignments                   |
        | recording the completed sync             |

  @rule-0652 @ears-event-driven
  Rule: When a course educator syncs the same Moodle course and section again within SYNC_INTERVAL_MINUTES of its last completed sync, the data API shall answer success without contacting Moodle.

    Scenario: A repeat inside the interval is skipped
      Given "lecturer" synced Moodle course "1234" at "2026-10-19T09:00:00Z"
      When "lecturer" syncs Moodle course "1234" again at "2026-10-19T09:30:00Z"
      Then the sync shall succeed
      And Moodle shall not have been contacted
      And the completed sync for course "pf1" shall be recorded at "2026-10-19T09:00:00.000Z"

    Scenario: A repeat after the interval runs again
      Given "lecturer" synced Moodle course "1234" at "2026-10-19T09:00:00Z"
      When "lecturer" syncs Moodle course "1234" again at "2026-10-19T10:01:00Z"
      Then the sync shall succeed
      And Moodle shall have been contacted again
      And the completed sync for course "pf1" shall be recorded at "2026-10-19T10:01:00.000Z"

    Scenario: A Moodle course with no assignments still completes the sync
      Given Moodle course 5678 has no assignments
      And "lecturer" synced Moodle course "5678" at "2026-10-19T09:00:00Z"
      When "lecturer" syncs Moodle course "5678" again at "2026-10-19T09:30:00Z"
      Then the sync shall succeed
      And Moodle shall not have been contacted

    Scenario: A section sync does not count as a sync of the whole course
      Given "lecturer" synced section 3 of Moodle course "1234" at "2026-10-19T09:00:00Z"
      When "lecturer" syncs Moodle course "1234" again at "2026-10-19T09:30:00Z"
      Then the sync shall succeed
      And Moodle shall have been contacted again
