@instructor
Feature: Checking a course in the reader
  As an instructor without a terminal
  I want the reader to check a course the way tutors validate does
  So that I find a misnamed folder before my students do, with nothing to install

  The checks run in the browser through @tutors/course-rules (apps/reader/src/routes/(create)/create/check.ts),
  the same core as the CLI, CI and Tutors Studio. Nothing is uploaded.

  @rule-0720 @ears-event-driven
  Rule: When the course wizard previews a course, the reader shall show what tutors validate finds in the files it is about to download.

    Scenario: A wizard course checks clean
      Given the wizard's files for a course with a side unit, notes, labs and a calendar
      When the preview is shown
      Then the preview shall say "No problems found."

    Scenario: The preview while the check runs
      Given the wizard's files for a course with a side unit, notes, labs and a calendar
      When the preview is shown before the check finishes
      Then the preview shall say "Checking the course…"

  @rule-0721 @ears-event-driven
  Rule: When an instructor checks a course .zip in the reader, the reader shall list each finding with its severity, rule, path and message, as tutors validate reports it.

    Scenario: A zipped course folder with a misnamed week
      Given the "broken" course of fixture "V002" zipped inside the folder "web-dev"
      When the instructor checks the zip
      Then the list shall say "4 errors, 0 warnings. Fix the errors before publishing."
      And the list shall show "Error V002 Week 3" with the message tutors validate gives

    Scenario: A course zipped from inside its folder
      Given the "fixed" course of fixture "V005" zipped at the top level
      When the instructor checks the zip
      Then the list shall say "No problems found."

    Scenario: A second zip chosen while the first is still being read
      Given the check page, with the "broken" course of fixture "V002" slow to read and the "fixed" course of fixture "V005" quick
      When the instructor chooses the slow zip and then the quick one
      Then the page shall name "fixed.zip" and say "No problems found."

  @rule-0722 @ears-unwanted
  Rule: If the file an instructor checks is not a zip that holds anything, then the reader shall say what to do instead of listing findings.

    Scenario: A PDF chosen by mistake
      Given a file that is not a zip
      When the instructor checks the zip
      Then the reader shall say "This file isn't a .zip that can be opened. Zip the course folder and try again."

    Scenario: An empty zip
      Given a zip holding only a .DS_Store file
      When the instructor checks the zip
      Then the reader shall say "This .zip is empty. Zip the course folder and try again."
