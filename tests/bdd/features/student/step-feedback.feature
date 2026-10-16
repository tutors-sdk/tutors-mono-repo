@student
Feature: Lecturer feedback on a lab step
  As a student working through a lab, and a lecturer reviewing it
  I want a lecturer's explanations and comments shown where they apply
  So that I read them on the step they are about, and the lecturer sees what they posted

  The reader reads a step's feedback from its own server (/api/feedback) as the person signed in,
  when the step opens and every minute while it stays on screen; no student joins a realtime
  channel for it. Elsewhere in the course, the reader looks for new explanations at most once a
  minute as the student moves between pages. These Rules drive the reader's feedback service over
  its /api/feedback handler and an in-memory store.

  Background:
    Given "ellen" teaches the course "cs101"
    And "alice" is on the step "02" of the lab "/lab/cs101/lab-01"

  @rule-0403 @ears-event-driven
  Rule: When a student opens a lab step, the reader shall show every unrevoked broadcast for that step above the content and every annotation addressed to that student below it, from one query.

    Scenario: A broadcast and a personal annotation show where they belong
      Given "ellen" has broadcast "Await the fetch." on the step "02"
      And "ellen" has written "Nearly there, alice." to "alice" on the step "02"
      But "ellen" has written "Look at line 4, bob." to "bob" on the step "02"
      When "alice" opens the step
      Then the reader shall show the banner "Await the fetch." above the step
      And the reader shall show the card "Nearly there, alice." below the step
      And the reader shall show no other annotation
      And the step's feedback shall have been read once

    Scenario: A visitor who is not signed in sees no feedback
      Given "ellen" has broadcast "Await the fetch." on the step "02"
      When a visitor who is not signed in opens the step
      Then the reader shall show no banner and no card

  @rule-0404 @ears-state-driven
  Rule: While a student stays on a lab step, the reader shall refresh its annotations every 60 seconds without joining a realtime channel.

    @active
    Scenario: A broadcast posted while the student reads arrives within a minute
      Given "alice" opens the step
      When "ellen" broadcasts "Check the port number." on the step "02"
      And 60 seconds pass
      Then the reader shall show the banner "Check the port number." above the step
      And the reader shall have joined no realtime channel for it

    @inactive
    Scenario: A student who left the step reads no more
      Given "alice" opens the step
      And "alice" leaves the step
      When 120 seconds pass
      Then the step's feedback shall have been read once

  @rule-0406 @ears-event-driven
  Rule: When an educator revokes an annotation, the reader shall stop showing it to students on their next refresh and keep it in the review history with the revocation time.

    Scenario: A revoked broadcast leaves the step and stays in the history
      Given "ellen" has broadcast "Await the fetch." on the step "02"
      And "alice" opens the step
      And the clock reads "2026-01-05T10:30:00.000Z"
      When "ellen" revokes the broadcast "Await the fetch."
      And 60 seconds pass
      Then the reader shall show no banner and no card
      And the step's history for "ellen" shall list "Await the fetch." revoked at "2026-01-05T10:30:00.000Z"

  @rule-0408 @ears-ubiquitous
  Rule: The reader shall render annotation bodies as markdown through the content renderer, sanitised as lab content is.

    Scenario: Markdown is rendered and a script is removed
      Given "ellen" has broadcast "Use **await** <script>alert(1)</script>here." on the step "02"
      When "alice" opens the step
      Then the banner shall render "await" in bold
      And the banner shall hold no script

  @rule-0409 @ears-ubiquitous
  Rule: The reader shall show a student the history of annotations they received in a course, newest first, and show an educator what was broadcast on a step and when.

    Scenario: A student's history is newest first and leaves out another student's
      Given the clock reads "2026-01-05T09:00:00.000Z"
      And "ellen" has broadcast "First, for everyone." on the step "02"
      And the clock reads "2026-01-05T09:10:00.000Z"
      And "ellen" has written "Then, for alice." to "alice" on the step "03"
      But "ellen" has written "For bob only." to "bob" on the step "03"
      When "alice" reads the feedback they received in "cs101"
      Then the history shall read "Then, for alice.", then "First, for everyone."

    Scenario: The educator sees what was broadcast on the step and when
      Given the clock reads "2026-01-05T09:00:00.000Z"
      And "ellen" has broadcast "First, for everyone." on the step "02"
      When "ellen" opens the step
      Then the step's history for "ellen" shall list "First, for everyone." posted at "2026-01-05T09:00:00.000Z"

    Scenario: A student sees no step history
      When "alice" opens the step
      Then the reader shall offer "alice" no step history

  @rule-0564 @ears-event-driven
  Rule: When an educator broadcasts an explanation on a lab step, the reader shall show the course's students on other pages of the course one toast naming the step and linking to it, without the explanation's text, and no more than one toast a minute.

    The reader looks for new explanations as the student moves between pages of the course, at
    most once a minute, so no Realtime message is spent on it. The explanation itself is read on
    the step, where the reader's server checks who is signed in.

    Scenario: A student elsewhere in the course is toasted on their next page
      Given "alice" is reading the course page of "cs101"
      When "ellen" broadcasts "Await the fetch." on the step "02"
      And 60 seconds pass
      And "alice" moves to another page of "cs101"
      Then the reader shall show "alice" one toast naming the step "02" and linking to "/lab/cs101/lab-01/02"
      And the toast shall not carry "Await the fetch."

    Scenario: A second explanation within the minute is not toasted again
      Given "alice" is reading the course page of "cs101"
      And "ellen" broadcasts "Await the fetch." on the step "02"
      And 60 seconds pass
      And "alice" moves to another page of "cs101"
      When "ellen" broadcasts "Check the status code." on the step "03"
      And "alice" moves to a third page of "cs101"
      Then the reader shall show "alice" one toast naming the step "02" and linking to "/lab/cs101/lab-01/02"

    Scenario: A student on the step itself reads the banner, not a toast
      Given "alice" is reading the course page of "cs101"
      When "ellen" broadcasts "Await the fetch." on the step "02"
      And 60 seconds pass
      And "alice" moves to the step "02"
      Then the reader shall show "alice" no toast

  @rule-0570 @ears-event-driven
  Rule: When someone else signs in on the same browser, the reader shall forget the feedback it read for the last person before reading any for them.

    Scenario: The next student sees none of the last student's feedback
      Given "ellen" has written "Nearly there, alice." to "alice" on the step "02"
      And "alice" reads the feedback they received in "cs101"
      When "bob" opens the step
      Then the reader shall show no banner and no card
      And the reader shall hold no received feedback until "bob" reads it
