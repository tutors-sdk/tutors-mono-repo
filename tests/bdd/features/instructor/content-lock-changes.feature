@instructor @reader
Feature: Content lock changes are checked on the server
  As an educator
  I want only a course's educators to be able to lock or unlock its resources
  So that nobody holding the public database key can hide or reveal a course's content

  The browser's RBAC decides what Educator Control shows. These Rules are what the server enforces
  before it writes tutors_content_locks with its server-only key.

  Background:
    Given "pf1" publishes an enrollment with "lecturer" as educator

  @rule-0630 @ears-event-driven
  Rule: When a course educator locks or unlocks a resource, the data API shall save the lock with the educator's own GitHub login as the person who changed it.

    Scenario: Locking and unlocking a topic saves who changed it
      When "lecturer" locks "/topic/pf1/topic-01"
      Then the lock change shall succeed
      And "/topic/pf1/topic-01" shall be saved as locked by "lecturer"
      When "lecturer" unlocks "/topic/pf1/topic-01"
      Then "/topic/pf1/topic-01" shall be saved as unlocked by "lecturer"

    Scenario: Educator Control sends the change to the server, not the database
      When Educator Control locks "/topic/pf1/topic-02"
      Then the browser shall have asked the server to lock "/topic/pf1/topic-02"
      And the browser shall not have written to the database

  @rule-0631 @ears-unwanted
  Rule: If the requester is not a verified educator of the published course, then the data API shall refuse the lock change without writing to the database.

    Scenario Outline: A student or visitor cannot change a lock
      When "<login>" locks "/topic/pf1/topic-01"
      Then the lock change shall fail with status <status>
      And no lock shall have been written

      Examples:
        | login     | status |
        | anonymous | 401    |
        | student   | 403    |

    Scenario: A course id outside the Netlify forms is refused before any fetch
      Given the lock change targets "localhost:5432"
      When "lecturer" locks "/topic/pf1/topic-01"
      Then the lock change shall fail with status 400
      And no lock shall have been written

  @rule-0632 @ears-unwanted
  Rule: If the server has no database service key or the write fails, then the data API shall refuse the lock change and report it as not saved.

    Scenario Outline: The server cannot save the lock
      Given the "<dependency>" is unavailable
      When "lecturer" locks "/topic/pf1/topic-01"
      Then the lock change shall fail with status <status>

      Examples:
        | dependency  | status |
        | service key | 503    |
        | database    | 502    |
