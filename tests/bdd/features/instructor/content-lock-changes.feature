@instructor @reader
Feature: Content lock changes are checked on the server
  As an educator
  I want only a course's educators to be able to lock or unlock its resources
  So that nobody holding the public database key can hide or reveal a course's content

  The browser's RBAC decides what Educator Control shows. These Rules are what the server enforces
  before it writes tutors_content_locks with its server-only key. Rules 0657 and 0658 are what Educator
  Control shows the educator while the server answers, and when it does not save a change.

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

  @rule-0657 @ears-unwanted
  Rule: If the server does not save a content lock change, then the reader shall tell the educator that the change is not saved for students.

    Scenario Outline: A lock change the server does not save is put back
      Given Educator Control shows "/topic/pf1/topic-01" as "<before>"
      And the server answers lock changes with "<answer>"
      When the educator sets "/topic/pf1/topic-01" to "<after>"
      Then Educator Control shall show "/topic/pf1/topic-01" as "<before>"
      And this browser shall store "/topic/pf1/topic-01" as "<before>"
      And the educator shall be told "Lock change not saved"

      Examples:
        | before   | after    | answer      |
        | unlocked | locked   | refused     |
        | locked   | unlocked | failed      |
        | no lock  | locked   | unreachable |

    Scenario: Show locked content to students is put back when it is not saved
      Given Educator Control shows "@settings/show-locked" as "unlocked"
      And the server answers lock changes with "failed"
      When the educator turns on "Show locked content to students"
      Then "Show locked content to students" shall be off
      And the educator shall be told "Lock change not saved"

    Scenario: Unlocking a card that the server does not save keeps the card locked
      Given Educator Control shows "/topic/pf1/topic-02" as "locked"
      And the server answers lock changes with "unreachable"
      When the educator selects Unlock on the card for "/topic/pf1/topic-02"
      Then the card for "/topic/pf1/topic-02" shall still be locked
      And the educator shall be told "Lock change not saved"

    Scenario: A reader without a lock database keeps the change in this browser only
      Given Educator Control shows "/topic/pf1/topic-01" as "unlocked"
      And the server answers lock changes with "no database"
      When the educator sets "/topic/pf1/topic-01" to "locked"
      Then Educator Control shall show "/topic/pf1/topic-01" as "locked"
      And this browser shall store "/topic/pf1/topic-01" as "locked"
      And Educator Control shall say lock changes are saved in this browser only

    Scenario: A change the server refuses after the educator has moved to another course leaves that course alone
      Given Educator Control shows "/topic/pf1/topic-01" as "unlocked"
      And the server is slow to answer lock changes
      When the educator sets "/topic/pf1/topic-01" to "locked"
      And the educator opens course "pf2" with "/topic/pf2/topic-01" locked
      And the server refuses the waiting lock change
      Then Educator Control shall show "/topic/pf2/topic-01" as "locked"
      And Educator Control shall show "/topic/pf1/topic-01" as "no lock"
      And this browser shall store "/topic/pf1/topic-01" as "unlocked"
      And the educator shall be told "Lock change not saved"

  @rule-0658 @ears-state-driven
  Rule: While a content lock change is waiting for the server, the reader shall refuse another change to that lock.

    @active
    Scenario: A second change waits for the first to be saved
      Given Educator Control shows "/topic/pf1/topic-01" as "unlocked"
      And the server is slow to answer lock changes
      When the educator sets "/topic/pf1/topic-01" to "locked"
      And the educator sets "/topic/pf1/topic-01" to "unlocked" before the server answers
      Then the switch for "/topic/pf1/topic-01" shall be busy
      And the browser shall have sent 1 lock change
      When the server answers the waiting lock change
      Then Educator Control shall show "/topic/pf1/topic-01" as "locked"
      And the switch for "/topic/pf1/topic-01" shall not be busy

    @inactive
    Scenario: A change after the first is saved goes through
      Given Educator Control shows "/topic/pf1/topic-01" as "unlocked"
      When the educator sets "/topic/pf1/topic-01" to "locked"
      And the educator sets "/topic/pf1/topic-01" to "unlocked"
      Then Educator Control shall show "/topic/pf1/topic-01" as "unlocked"
      And this browser shall store "/topic/pf1/topic-01" as "unlocked"
      And the browser shall have sent 2 lock changes
      And no lock change notice shall be shown
