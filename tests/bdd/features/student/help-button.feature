@student
Feature: Asking for help from a lab step
  As a student working through a lab
  I want a help control on the step, the lecturer's hint where I asked, and to say whether help helped
  So that help reaches me where I am and the lecturer learns what works

  The reader's help control is helpService (@tutors/community/assistance/help) and HelpButton and
  HelpNotice on the lab step. It asks through the reader's server (POST /api/assistance) and reads
  the student's own request from stored rows (GET /api/assistance/mine), never the course's queue
  (Rule 0392). These Rules drive helpService over an in-memory help desk that runs the Assistance
  use cases as the person signed in.

  Background:
    Given "ellen" teaches the course "cs101"
    And "alice" is on the step "02" of the lab "/lab/cs101/lab-01" in the course "cs101"

  @rule-0397 @ears-event-driven
  Rule: When a lecturer answers a hint request with a typed hint, tutors shall show the hint to that student on the step and resolve the request as helped by a hint.

    Scenario: The student reads the lecturer's hint on the step
      Given "alice" is signed in and asked for help as "hint"
      When "ellen" answers the request with the hint "Check the loop bound."
      And the reader reads the request of "alice" again
      Then the step shall show the hint "Check the loop bound."
      And the request shall be resolved as helped by a hint

    Scenario: The hint stays on the step it was asked from
      Given "alice" is signed in and asked for help as "hint"
      When "ellen" answers the request with the hint "Check the loop bound."
      And "alice" moves to the step "03"
      Then the step shall show no hint

  @rule-0398 @ears-event-driven
  Rule: When a request is resolved, tutors shall ask the student once whether it helped and record the answer against the request.

    Scenario: The student says the lecturer's help helped
      Given "alice" is signed in and asked for help as "lecturer"
      When "ellen" resolves the request
      And the reader reads the request of "alice" again
      Then the reader shall ask whether the help helped
      When "alice" answers that it helped
      Then the request shall record that it helped
      And the reader shall not ask again

    Scenario: The student marking it solved is asked too
      Given "alice" is signed in and asked for help as "stuck"
      When "alice" marks the request solved
      Then the reader shall ask whether the help helped

    Scenario: Closing the question without an answer is not asked again
      Given "alice" is signed in and asked for help as "stuck"
      When "ellen" resolves the request
      And the reader reads the request of "alice" again
      And "alice" closes the question
      And the reader reads the request of "alice" once more
      Then the reader shall not ask again
      And the request shall record no answer

  @rule-0561 @ears-unwanted
  Rule: If a student's help action is not kept, then tutors shall tell the student it was not sent and send that same action again when the student retries.

    Scenario: A withdrawal that was not kept is sent again as a withdrawal
      Given "alice" is signed in and asked for help as "stuck"
      And the help desk does not keep the next action of "alice"
      When "alice" withdraws the request
      Then the reader shall tell "alice" it was not sent
      When "alice" retries
      Then the request shall be "withdrawn"
      And "alice" shall have asked for help once

    Scenario: A rating that was not kept is asked until it is kept
      Given "alice" is signed in and asked for help as "stuck"
      And "alice" marks the request solved
      And the help desk does not keep the next action of "alice"
      When "alice" answers that it helped
      Then the reader shall tell "alice" it was not sent
      And the reader shall still ask whether the help helped
      When "alice" retries
      Then the request shall record that it helped

  @rule-0562 @ears-ubiquitous
  Rule: Tutors shall show a student their help request as read after their latest action or arrival on a lab step, and read it again only while they are on a lab.

    Scenario: A read that started before a withdrawal does not bring the request back
      Given "alice" is signed in and asked for help as "stuck"
      And the reader starts reading the request of "alice"
      When "alice" withdraws the request
      And the older read answers
      Then the reader shall show the request as "withdrawn"

    Scenario: Leaving the lab stops reading, and coming back reads the request again
      Given "alice" is signed in and asked for help as "stuck"
      When "alice" leaves the lab
      And 90 seconds pass on the lab
      Then the reader shall not have read the request since "alice" left
      When "ellen" acknowledges the request
      And "alice" comes back to the lab
      Then the reader shall show the request as "acknowledged"

  @rule-0399 @ears-ubiquitous
  Rule: Tutors shall hide the help control in anonymous mode and for visitors who are not signed in, and keep the lab usable without it.

    Scenario: A signed-in student is offered the help control
      Given "alice" is signed in to the reader
      When "alice" arrives at the step
      Then the help control shall be offered

    Scenario Outline: The help control is hidden from a visitor who is not signed in, and in anonymous mode
      Given the reader is <mode>
      When a visitor arrives at the step
      Then the help control shall be hidden
      And nothing shall have been asked of the help desk

      Examples:
        | mode                |
        | signed in to nobody |
        | in anonymous mode   |
