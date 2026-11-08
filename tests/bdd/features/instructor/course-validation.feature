@instructor
Feature: Course validation
  As an instructor
  I want my course folder checked before I publish it
  So that a misnamed folder or a missing file is named to me instead of silently missing from my course

  The validator is @tutors/course-rules (packages/jsr/course-rules). It reads a course through a
  file-system port and never writes. Each Rule below has a broken and a fixed course under
  tests/fixtures/validate/<rule>.yaml; the broken course breaks only that rule.

  @rule-0695 @ears-unwanted
  Rule: If a course folder has no course.md at its root, then tutors shall report rule V001 against the course folder.

    Scenario: A folder of topics with no course.md
      Given the "broken" course of fixture "V001"
      When the course is validated
      Then the findings shall be exactly "V001 error <root>"

    Scenario: The same course with its course.md
      Given the "fixed" course of fixture "V001"
      When the course is validated
      Then there shall be no findings

  @rule-0696 @ears-unwanted
  Rule: If a folder's name starts with no learning-object kind and the folder holds anything other than images, then tutors shall report rule V002 against that folder with a sentence saying it won't appear in the course.

    Scenario: Folders named for a week, a lab and slides are each named once
      Given the "broken" course of fixture "V002"
      When the course is validated
      Then the findings shall be exactly "V002 error Week 3; V002 error topic-01/Slides; V002 error unit-1/Lab1"
      And the finding for "Week 3" shall say "won't appear in your course"
      And the finding for "Week 3" shall suggest the name "topic-week-3"

    Scenario: Typed folders, an img folder and hidden folders pass
      Given the "fixed" course of fixture "V002"
      When the course is validated
      Then there shall be no findings

  @rule-0697 @ears-unwanted
  Rule: If a unit, side or topic folder holds no .md file, then tutors shall report rule V003 against that folder.

    Scenario: A unit and a topic with no descriptor
      Given the "broken" course of fixture "V003"
      When the course is validated
      Then the findings shall be exactly "V003 error unit-1; V003 error unit-1/topic-01"

    Scenario: The same course with descriptors
      Given the "fixed" course of fixture "V003"
      When the course is validated
      Then there shall be no findings

  @rule-0698 @ears-unwanted
  Rule: If a talk lacks a .md or holds other than one deck, a note holds other than one .md, or a lab's steps are misnamed or skip a number, then tutors shall report rule V004 against the folder or file at fault.

    Scenario: Two PDFs, no slides, two notes and a gap in the steps
      Given the "broken" course of fixture "V004"
      When the course is validated
      Then the findings shall be exactly "V004 error topic-01/lab-01; V004 error topic-01/lab-01/notes.md; V004 error topic-01/note-01; V004 error topic-01/talk-01; V004 error topic-01/talk-02"
      And the finding for "topic-01/lab-01" shall say "step 03 is missing"

    Scenario: Each talk with one deck, each note with one file, contiguous steps
      Given the "fixed" course of fixture "V004"
      When the course is validated
      Then there shall be no findings

  @rule-0699 @ears-unwanted
  Rule: If a web link's weburl file or a GitHub link's githubid file is missing or its first line is not an address, then tutors shall report rule V005 against the link.

    Scenario: A missing weburl, an empty weburl and a githubid in prose
      Given the "broken" course of fixture "V005"
      When the course is validated
      Then the findings shall be exactly "V005 error topic-01/github-starter/githubid; V005 error topic-01/web-docs; V005 error topic-01/web-spec/weburl"

    Scenario: Each link file holding its address
      Given the "fixed" course of fixture "V005"
      When the course is validated
      Then there shall be no findings

  @rule-0700 @ears-unwanted
  Rule: If properties.yaml, calendar.yaml, enrollment.yaml or badges.yaml does not parse or does not have the shape the generator reads, then tutors shall report rule V006 against that file.

    Scenario: A tab in properties, a calendar with no weeks and an enrollment that is a bare list
      Given the "broken" course of fixture "V006"
      When the course is validated
      Then the findings shall be exactly "V006 error calendar.yaml; V006 error enrollment.yaml; V006 error properties.yaml"
      And the finding for "properties.yaml" shall say "line 2"

    Scenario: The same files written as the generator reads them
      Given the "fixed" course of fixture "V006"
      When the course is validated
      Then there shall be no findings
