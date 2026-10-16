@ui @reader
Feature: Private notes on a lab step
  As a student
  I want a private place beside each lab step to write down what I find
  So that I can come back to my notes and take them away as one document

  The notes panel is the reader's face of the private notes in student/private-notes.feature
  (Rules 0380 to 0383): notes stay in the student's browser. Each scenario is proved by the
  Playwright test with the same title, tagged with the Rule id, in apps/reader/tests/e2e.

  @rule-0554 @ears-event-driven
  Rule: When a student opens the notes on a lab step, the reader shall show that step's private note in a panel beside the step, or in a sheet along the bottom of a screen narrower than 1024 pixels.

    Scenario: The notes panel opens beside the step
      Given a student is on a lab step on a wide screen
      When the student selects "Notes"
      Then a notes panel sits to the right of the step with the cursor in its note

    Scenario: The notes panel is a sheet along the bottom of a phone
      Given a student is on a lab step on a phone
      When the student selects "Notes"
      Then the notes panel spans the bottom of the screen

  @rule-0555 @ears-state-driven
  Rule: While a lab step has a note, the reader shall mark that step with a dot in the lab's step list and on the Notes button.

    @active
    Scenario: A step with a note is marked
      Given a student has written a note on the first step
      Then the first step in the step list carries a note dot
      And the Notes button carries a note dot

    @inactive
    Scenario: A step without a note is not marked
      Given a student has written a note on the first step
      When the student moves to the second step
      Then the Notes button carries no note dot
      And only the first step in the step list carries a note dot

  @rule-0556 @ears-event-driven
  Rule: When a student moves to another lab step, the reader shall keep the notes panel open, minimised or closed as the student left it and show the new step's own note.

    Scenario: The open panel follows the student to the next step
      Given a student has written a note on the first step with the notes panel open
      When the student moves to the second step
      Then the notes panel is still open and its note is empty
      And going back shows the first step's note again

    Scenario: A minimised panel stays minimised
      Given a student has minimised the notes panel
      When the student moves to the second step
      Then the notes panel is still minimised

    Scenario: Arrow keys in a note move the cursor, not the step
      Given a student is typing in the notes panel
      When the student presses the right arrow key
      Then the student is still on the same step

  @rule-0557 @ears-event-driven
  Rule: When a student exports notes from the notes panel, the reader shall download one markdown file of the course's notes, built in the browser and sent to no server.

    Scenario: Exporting downloads the course's notes as markdown
      Given a student has written notes on two steps
      When the student selects "Export course notes"
      Then a markdown file named after the course downloads with both notes under the lab's heading
      And no request carried the notes

  @rule-0558 @ears-event-driven
  Rule: When a student confirms deleting all notes for a course, the reader shall remove that course's notes from the browser and keep the notes of other courses.

    Scenario: Deleting all notes asks first and keeps other courses' notes
      Given a student has a note in this course and a note kept for another course
      When the student selects "Delete all notes for this course" and confirms
      Then this course's notes are gone from the browser
      And the other course's note is still there
