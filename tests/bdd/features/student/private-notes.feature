@student
Feature: Private notes on lab steps
  As a student
  I want a private place to write about each lab step
  So that I can find my discoveries and questions again and take them away as one document

  A note belongs to one lab step, named by the course id, the lab's route and the step id. Notes
  stay in the student's browser and are never sent to a server. These Rules drive the notes
  (packages/svelte/course/src/notes) and the reader's notes panel state over the browser's local
  storage; what the panel looks like on screen is ui/lab-notes.feature.

  Background:
    Given the lab "/lab/cs101/lab-01" of the course "cs101" has the steps "01, 02, 03"

  @rule-0380 @ears-event-driven
  Rule: When a learner edits the note of a lab step, tutors shall keep the note in the browser under the step's reference within 1 second and send nothing to a server.

    Scenario: A note is kept in the browser
      When "alice" writes "Remember to await the fetch" in the note of the step "02"
      Then the note shall be kept under "@notes/cs101/lab/cs101/lab-01/02" within 1 second
      And nothing shall have been sent to a server

    Scenario: The notes panel keeps a typed note in the browser's local storage
      When "alice" types "Remember to await the fetch" in the notes panel at the step "02"
      Then the browser's local storage shall hold "Remember to await the fetch" under "@notes/cs101/lab/cs101/lab-01/02" within 1 second
      And nothing shall have been sent to a server

  @rule-0381 @ears-state-driven
  Rule: While a learner moves between steps and labs of a course, tutors shall show each step's own note in the notes panel and keep the panel's open, minimised and width state.

    @active
    Scenario: Moving to the next step swaps the note and keeps the panel
      Given "alice" has the note "first thoughts" at the step "01" and "second thoughts" at the step "02"
      And the notes panel is open, not minimised and 420 pixels wide at the step "01"
      When "alice" moves to the step "02"
      Then the notes panel shall show "second thoughts"
      And the notes panel shall still be open, not minimised and 420 pixels wide

    @inactive
    Scenario: Staying on a step keeps its note and the panel
      Given "alice" has the note "first thoughts" at the step "01" and "second thoughts" at the step "02"
      And the notes panel is open, not minimised and 420 pixels wide at the step "01"
      When "alice" stays on the step "01"
      Then the notes panel shall show "first thoughts"
      And the notes panel shall still be open, not minimised and 420 pixels wide

  @rule-0382 @ears-event-driven
  Rule: When a learner exports a course's notes, tutors shall produce one markdown document with a heading per lab, a sub-heading per step linking to the reader, and each note's body, kind and date.

    Scenario: A course's notes export as one document
      Given "alice" has the note "first thoughts" at the step "01" and "second thoughts" at the step "02"
      When "alice" exports the notes of the course titled "Web Development"
      Then the document shall open with the heading "# Web Development notes"
      And the document shall have one lab heading "## Lab One"
      And the document shall have the step heading "### [Step 02](https://reader.example/lab/cs101/lab-01/02)" followed by "_note · 2026-01-05_" and "second thoughts"

  @rule-0383 @ears-unwanted
  Rule: If browser storage is unavailable or full, then tutors shall keep the notes of the session in memory, tell the learner once that the notes are kept for this session only, and still export them.

    Scenario: Notes survive the session when storage refuses them
      Given browser storage refuses every write
      When "alice" writes "first thoughts" in the note of the step "01"
      And "alice" writes "second thoughts" in the note of the step "02"
      Then tutors shall have told "alice" once that the notes are kept for this session only
      And the note of the step "01" shall read "first thoughts"
      And the export of the course shall contain "first thoughts" and "second thoughts"

    Scenario: The notes panel keeps the session's notes when local storage is full
      Given the browser's local storage is full
      When "alice" types "first thoughts" in the notes panel at the step "01"
      And "alice" types "second thoughts" in the notes panel at the step "02"
      Then the notes panel shall have said once that the notes are kept for this session only
      And the notes panel's export of the course shall contain "first thoughts" and "second thoughts"
