@instructor
Feature: Importing a course exported from a learning platform
  As an instructor whose course lives in Moodle or another learning platform
  I want tutors import to take the platform's course export
  So that I start from the course I already teach, without copying each file out by hand

  Issue #611. `tutors import` takes a Moodle course backup (.mbz) or an IMS Common Cartridge (.imscc) in
  place of a folder. packages/jsr/create/src/course-archive.ts lays the export out as a folder of material,
  one "Week NN <section>" folder per section, which proposeShape reads as it reads any folder (Rule 0717).
  The archives are written by tests/support/course-archives.ts in the shapes Moodle 4 and Canvas export.

  @rule-0779 @ears-event-driven
  Rule: When tutors import is given a Moodle course backup, tutors shall propose the course from it with one week per section in order, leaving the general section's files for the instructor to place.

    Scenario: A Moodle backup with slides, a lab handout, a link and a page
      Given a Moodle backup of "Web Development II" with a general section and two weeks of material
      When the instructor runs tutors import on the backup
      Then the exit status shall be 0
      And the new course shall have no errors
      And week 1 shall hold a "talk" from "Week 01 Introduction/Lecture 1 - HTML.pdf"
      And week 2 shall link to "https://developer.mozilla.org/"
      And the output shall list "Course handbook.pdf" to place by hand
      And no unpacked files shall be left behind

  @rule-0780 @ears-event-driven
  Rule: When tutors import is given an IMS Common Cartridge, tutors shall propose the course from it with one week per module in order.

    Scenario: A cartridge with two modules
      Given a Common Cartridge with two modules of material
      When the instructor runs tutors import on the cartridge
      Then the exit status shall be 0
      And the new course shall have no errors
      And week 1 shall hold a "talk" from "Week 01 Module 1 Getting started/slides-1.pdf"
      And week 2 shall also hold a "note" from "Week 02 Module 2 Forms/Reading.md"
      And no unpacked files shall be left behind

  @rule-0781 @ears-unwanted
  Rule: If a course export names a file outside itself, then tutors shall refuse the export and write no course.

    Scenario: A backup that reaches outside its folder
      Given a Moodle backup with a file named "../outside.pdf"
      When the instructor runs tutors import on the backup
      Then the exit status shall be 1
      And the output shall say "The archive names a file outside itself"
      And no course folder shall have been written
      And no unpacked files shall be left behind
