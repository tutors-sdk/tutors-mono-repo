@instructor
Feature: Course warnings and safe fixes
  As an instructor
  I want to hear about what will surprise me or my students, and have the safe repairs made for me
  So that a course that builds also reads the way I meant it to

  Warnings (V007-V011) and the one note (V012) come from @tutors/course-rules (packages/jsr/course-rules/src/warnings.ts).
  A course with only warnings still publishes; `tutors validate --strict` fails on them. Each Rule has a broken
  and a fixed course under tests/fixtures/validate/<rule>.yaml. `--fix` applies only the fixes that rename or
  add a standard file (src/fix.ts); it never edits a lecturer's own text.

  @rule-0710 @ears-unwanted
  Rule: If a typed folder's name has capitals, spaces or accents, or a file's name has spaces or accents, then tutors shall report rule V007 as a warning with the name to use instead.

    Scenario: A capitalised talk folder, a PDF with spaces and a note with an accent and a dash
      Given the "broken" course of fixture "V007"
      When the course is validated
      Then the findings shall be exactly "V007 warn topic-01/note-01/Reading – Café.md; V007 warn topic-01/talk-Intro; V007 warn topic-01/talk-Intro/Week 1 Slides.pdf"
      And the finding for "topic-01/talk-Intro" shall suggest the name "talk-intro"
      And the finding for "topic-01/note-01/Reading – Café.md" shall suggest the file name "Reading-Cafe.md"

    Scenario: The same course with portable names
      Given the "fixed" course of fixture "V007"
      When the course is validated
      Then there shall be no findings

  @rule-0711 @ears-unwanted
  Rule: If the .md file a card takes its title from has no title on its first line, then tutors shall report rule V008 as a warning against that file.

    Scenario: A topic with only front matter and a talk that opens with a blank line
      Given the "broken" course of fixture "V008"
      When the course is validated
      Then the findings shall be exactly "V008 warn topic-01/talk-01/talk.md; V008 warn topic-01/topic.md"

    Scenario: The same cards with titles
      Given the "fixed" course of fixture "V008"
      When the course is validated
      Then there shall be no findings

  @rule-0712 @ears-unwanted
  Rule: If a page shows an image that does not exist beside it or is 2 MB or larger, then tutors shall report rule V009 as a warning against the page, once per image.

    Scenario: Two missing images, and an example inside a code block that is not checked
      Given the "broken" course of fixture "V009"
      When the course is validated
      Then the findings shall be exactly "V009 warn topic-01/note-01/note.md; V009 warn topic-01/note-01/note.md"
      And the finding for "topic-01/note-01/note.md" shall say "img/diagram.png"

    Scenario: A 3 MB screenshot
      Given the "fixed" course of fixture "V009"
      And the file "topic-01/note-01/img/screenshot.png" weighs 3 MB
      When the course is validated
      Then the findings shall be exactly "V009 warn topic-01/note-01/note.md"
      And the finding for "topic-01/note-01/note.md" shall say "3.0 MB"

    Scenario: Every image present and small
      Given the "fixed" course of fixture "V009"
      When the course is validated
      Then there shall be no findings

  @rule-0713 @ears-unwanted
  Rule: If topics side by side are not numbered, or their numbers skip or run backwards once sorted by name, then tutors shall report rule V010 as a warning against each topic out of place.

    Scenario: topic-1, topic-10, topic-2 and topic-intro
      Given the "broken" course of fixture "V010"
      When the course is validated
      Then the findings shall be exactly "V010 warn topic-10; V010 warn topic-2; V010 warn topic-intro"

    Scenario: The same topics numbered with two digits in sequence
      Given the "fixed" course of fixture "V010"
      When the course is validated
      Then there shall be no findings

  @rule-0714 @ears-unwanted
  Rule: If a course has no netlify.toml, or its netlify.toml does not publish the json or html folder the generator writes, then tutors shall report rule V011 as a warning.

    Scenario: No netlify.toml
      Given the "broken" course of fixture "V011"
      When the course is validated
      Then the findings shall be exactly "V011 warn netlify.toml"

    Scenario: A netlify.toml that publishes the course's source folder
      Given the "fixed" course of fixture "V011" with a netlify.toml that publishes "."
      When the course is validated
      Then the findings shall be exactly "V011 warn netlify.toml"
      And the finding for "netlify.toml" shall say "Page not found"

    Scenario: The standard netlify.toml
      Given the "fixed" course of fixture "V011"
      When the course is validated
      Then there shall be no findings

  @rule-0715 @ears-unwanted
  Rule: If a unit, side or topic holds no learning objects, then tutors shall report rule V012 against it as a note, which no exit status counts.

    Scenario: An empty unit, side and topic
      Given the "broken" course of fixture "V012"
      When the course is validated
      Then the findings shall be exactly "V012 info side; V012 info topic-01; V012 info unit-1"
      And the course shall pass even strict checking

    Scenario: Each holding something
      Given the "fixed" course of fixture "V012"
      When the course is validated
      Then there shall be no findings

  @rule-0716 @ears-event-driven
  Rule: When tutors validate runs with --fix, tutors shall apply only the safe fixes (renames for V002 and V007 other than images, and the standard netlify.toml for V011) without overwriting any existing file, then report what remains.

    Scenario: Fixing the V007 course gives its fixed form
      Given the "broken" course of fixture "V007"
      When the course is fixed
      Then the course shall equal the "fixed" course of fixture "V007"
      And there shall be no findings

    Scenario: Fixing the V011 course writes the standard netlify.toml
      Given the "broken" course of fixture "V011"
      When the course is fixed
      Then the course shall equal the "fixed" course of fixture "V011"

    Scenario: An image is named but not renamed, because pages refer to it by name
      Given the "fixed" course of fixture "V009" with an image "topic-01/note-01/Screen Shot.png"
      When the course is fixed
      Then the file "topic-01/note-01/Screen Shot.png" shall still exist
      And the findings shall include "V007 warn topic-01/note-01/Screen Shot.png"

    Scenario: A rename onto a folder that already exists is skipped
      Given the "broken" course of fixture "V007" with a folder "topic-01/talk-intro" already present
      When the course is fixed
      Then the fix of "topic-01/talk-Intro" shall be skipped because "topic-01/talk-intro already exists"
