@ui @instructor
Feature: Check a course in Tutors Validator
  As a lecturer
  I want to check a published course or a local source ZIP
  So that enrollment and course errors are found before students encounter them

  @rule-0754 @ears-event-driven
  Rule: When a lecturer checks a course URL, tutors shall show published schema and metadata findings with their severity, rule, path and message.

    Scenario: A published course with an invalid student entry
      Given a published course with a student missing an id
      When the lecturer checks the course URL
      Then the results show an enrollment error and explain the scope of URL checks

    Scenario: A valid published course
      Given a published course with valid course data
      When the lecturer checks the course URL
      Then the results show no problems

  @rule-0755 @ears-event-driven
  Rule: When a lecturer chooses a course source ZIP, tutors shall validate its files in the browser without sending course contents to a server.

    Scenario: A local ZIP with invalid enrollment
      Given a source ZIP with a student missing an id
      When the lecturer chooses the ZIP
      Then the results show the shared enrollment finding without an upload request

    Scenario: A new ZIP replaces a pending URL check
      Given a URL check is waiting for its course host
      When the lecturer chooses a valid source ZIP
      Then only the ZIP results are shown

    Scenario: A course ZIP is dropped into the upload area
      Given a valid source ZIP
      When the lecturer drags it into the highlighted ZIP drop area
      Then the ZIP results are shown without opening a file picker

    Scenario: The complete source tree is validated
      Given a ZIP with invalid students and a nested topic containing a broken image, quiz, Marp deck and Mermaid diagram
      When the lecturer chooses the ZIP
      Then the results identify both student entries and each nested content error

  @rule-0756 @ears-unwanted
  Rule: If a URL or ZIP cannot be read, then tutors shall show a recovery message instead of an all-clear result.

    Scenario: An unreadable ZIP
      Given a file that is not a ZIP
      When the lecturer chooses the file
      Then the results explain how to provide a readable course ZIP

    Scenario: A course host refuses cross-origin reads
      Given a course URL that cannot be fetched by the browser
      When the lecturer checks the course URL
      Then the results suggest checking a source ZIP locally

    Scenario: Multiple ZIPs are refused
      Given two ZIP files
      When the lecturer drops both into the ZIP drop area
      Then the results ask for one course ZIP at a time

  @rule-0757 @ears-event-driven
  Rule: When a course check finishes, tutors shall distinguish passed checks, warnings and errors with severity counts, findings grouped by path and filters for each severity.

    Scenario: A course with warnings but no errors
      Given an older published course that omits authLevel
      When the lecturer checks the course URL
      Then the results show a warning state with one format warning

    Scenario: Error and warning findings can be filtered
      Given an older published course with two invalid student entries
      When the lecturer checks the course URL
      Then the results show two errors and one warning grouped by path
      And the lecturer can filter warnings, errors, or all findings
