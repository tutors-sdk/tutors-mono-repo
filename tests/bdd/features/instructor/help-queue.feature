@instructor
Feature: The help queue
  As a lecturer running a lab
  I want to see who needs help, where, for what, and for how long
  So that I can get to the students who have waited longest and those who need me

  The queue is the course's open and acknowledged help requests. Waiting time comes from the clock
  and is never stored; a lecturer request escalates after 5 minutes and is urgent after 10; a
  request still live 4 hours after it was raised withdraws itself. These Rules drive the
  Assistance use cases over in-memory adapters; the queue's routes and feed are
  shared/help-request-server.feature.

  Background:
    Given "ellen" teaches the course "cs101"
    And "alice" is signed in and on the step "02" of the lab "/lab/cs101/lab-01" in the course "cs101"

  @rule-0387 @ears-ubiquitous
  Rule: Tutors shall compute a request's waiting time from the clock and the request time, never store it.

    Scenario: Waiting time grows with the clock and nothing is written
      Given "alice" asked for help as "stuck" at "2026-01-05T09:00:00.000Z"
      When the clock reads "2026-01-05T09:07:30.000Z" and "ellen" reads the queue
      Then the request shall have waited 450 seconds
      And no stored request shall carry a waiting time
      And reading the queue shall have written nothing to the store

  @rule-0388 @ears-state-driven
  Rule: While a lecturer request has waited more than 5 minutes, tutors shall mark it escalated; after 10 minutes, urgent.

    @active
    Scenario Outline: A lecturer request escalates as it waits
      Given "alice" asked for help as "lecturer" at "2026-01-05T09:00:00.000Z"
      When the clock reads "<now>" and "ellen" reads the queue
      Then the request shall be marked "<escalation>"

      Examples:
        | now                      | escalation |
        | 2026-01-05T09:05:01.000Z | escalated  |
        | 2026-01-05T09:10:01.000Z | urgent     |

    @inactive
    Scenario Outline: A request that has not waited long, or is not for the lecturer, does not escalate
      Given "alice" asked for help as "<kind>" at "2026-01-05T09:00:00.000Z"
      When the clock reads "<now>" and "ellen" reads the queue
      Then the request shall be marked "none"

      Examples:
        | kind     | now                      |
        | lecturer | 2026-01-05T09:05:00.000Z |
        | stuck    | 2026-01-05T09:30:00.000Z |

  @rule-0389 @ears-event-driven
  Rule: When a lecturer acknowledges, resolves or a student withdraws a request, tutors shall move it to that state once, record who and when, and refuse any transition not in the state table.

    Scenario: A lecturer acknowledges and then resolves
      Given "alice" asked for help as "stuck" at "2026-01-05T09:00:00.000Z"
      When "ellen" acknowledges the request at "2026-01-05T09:02:00.000Z"
      And "ellen" resolves the request at "2026-01-05T09:05:00.000Z"
      Then the request shall be "resolved" by "ellen" at "2026-01-05T09:05:00.000Z"
      And the request shall record it was acknowledged by "ellen" at "2026-01-05T09:02:00.000Z"

    Scenario: A student withdraws their request
      Given "alice" asked for help as "stuck" at "2026-01-05T09:00:00.000Z"
      When "alice" withdraws the request at "2026-01-05T09:03:00.000Z"
      Then the request shall be "withdrawn" by "alice" at "2026-01-05T09:03:00.000Z"

    Scenario: A second acknowledgement is refused
      Given "alice" asked for help as "stuck" at "2026-01-05T09:00:00.000Z"
      When "ellen" acknowledges the request at "2026-01-05T09:02:00.000Z"
      And "ellen" acknowledges the request at "2026-01-05T09:03:00.000Z"
      Then the second action shall be refused as "not-in-state-table"
      And the request shall record it was acknowledged by "ellen" at "2026-01-05T09:02:00.000Z"

    Scenario: A resolved request cannot be withdrawn
      Given "alice" asked for help as "stuck" at "2026-01-05T09:00:00.000Z"
      When "ellen" resolves the request at "2026-01-05T09:05:00.000Z"
      And "alice" withdraws the request at "2026-01-05T09:06:00.000Z"
      Then the second action shall be refused as "not-in-state-table"
      And the request shall be "resolved" by "ellen" at "2026-01-05T09:05:00.000Z"

    Scenario: Another student cannot withdraw the request
      Given "alice" asked for help as "stuck" at "2026-01-05T09:00:00.000Z"
      When "bob" withdraws the request at "2026-01-05T09:03:00.000Z"
      Then the action shall be refused as "not-permitted"
      And the request shall still be "open"
