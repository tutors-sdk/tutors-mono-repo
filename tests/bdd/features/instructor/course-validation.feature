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
  Rule: If a folder in the course, a unit, a side or a topic has a name that starts with no learning-object kind and holds course material (slides, a video id, lab steps, a page named for a kind or a learning object), then tutors shall report rule V002 against that folder with a sentence saying it won't appear in the course.

    Scenario: Folders named for a week, a lab and slides are each named once
      Given the "broken" course of fixture "V002"
      When the course is validated
      Then the findings shall be exactly "V002 error Week 3; V002 error topic-01/Slides; V002 error unit-1/-talk-02-anatomy; V002 error unit-1/Lab1; V012 info topic-01; V012 info unit-1"
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
  Rule: If a talk lacks a .md or holds other than one deck, a note holds other than one .md, or a lab's steps are misnamed, then tutors shall report rule V004 against the folder or file at fault.

    Scenario: Two PDFs, no slides, two notes and a misnamed step
      Given the "broken" course of fixture "V004"
      When the course is validated
      Then the findings shall be exactly "V004 error topic-01/lab-01/notes.md; V004 error topic-01/note-01; V004 error topic-01/talk-01; V004 error topic-01/talk-02"
      And the finding for "topic-01/lab-01/notes.md" shall say "isn't named as a step"

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

  @rule-0731 @ears-unwanted
  Rule: If a folder in the course, a unit, a side or a topic has a name that starts with no learning-object kind and holds only working files, then tutors shall report rule V018 as a warning against that folder, saying students won't see it and offering no fix.

    Scenario: Code, scripts and exam notes kept beside a course
      Given the "broken" course of fixture "V018"
      When the course is validated
      Then the findings shall be exactly "V018 warn code; V018 warn exams; V018 warn scripts"
      And the finding for "code" shall say "That's fine for working files such as code, scripts or slide sources"
      And the finding for "code" shall offer no fix

    Scenario: The course without its working folders
      Given the "fixed" course of fixture "V018"
      When the course is validated
      Then there shall be no findings

  @rule-0732 @ears-ubiquitous
  Rule: For a folder of no learning-object kind inside a lab, note, talk or other single learning object, tutors shall treat it as that learning object's resources and report neither V002 nor V018 against it.

    Scenario: A lab's assets folder of downloads is not named
      Given the "fixed" course of fixture "V018"
      When the course is validated
      Then the folder "topic-01/book-01/assets" shall not be named

  @rule-0740 @ears-unwanted
  Rule: If a lab's first step is numbered above 01 or its steps skip a number, then tutors shall report rule V019 as a warning against the lab, saying students still see every step.

    Scenario: A gap in one lab's steps and another lab starting at 02
      Given the "broken" course of fixture "V019"
      When the course is validated
      Then the findings shall be exactly "V019 warn topic-01/lab-01; V019 warn topic-01/lab-02"
      And the finding for "topic-01/lab-01" shall say "step 02 is missing before 03"

    Scenario: Steps numbered from 00 or 01 with no gaps
      Given the "fixed" course of fixture "V019"
      When the course is validated
      Then there shall be no findings

  @rule-0741 @ears-unwanted
  Rule: If a folder V002 names becomes a learning-object kind once its name is tidied to lower case and hyphens, then tutors shall suggest that tidied name, keeping the kind, rather than a topic.

    Scenario: A lab and a talk whose names only need tidying
      Given the "broken" course of fixture "V002"
      When the course is validated
      Then the finding for "unit-1/-talk-02-anatomy" shall suggest the name "talk-02-anatomy"
      And the finding for "unit-1/Lab1" shall also suggest the name "lab1"

  @rule-0763 @ears-unwanted
  Rule: If a lab holds a .md not named as a step, then tutors shall offer, as the V004 finding's fix, a rename to a step name that keeps the page's title, using a free step number the name already starts with or else the number after the lab's last step.

    Older courses kept a solutions or talk page beside a lab's steps. The generator shows such a page as a step with no
    id or address, so it stays an error; the fix puts the standard one command away.

    Scenario: A notes page after three steps becomes step 04
      Given the "broken" course of fixture "V004"
      When the course is validated
      Then the finding for "topic-01/lab-01/notes.md" shall offer the rename to "topic-01/lab-01/04.notes.md"

    Scenario: A page numbered without the dot keeps its number, the rest follow the last step, and the fixes settle
      Given a lab "topic-01/lab-01" holding "01.Setup.md, 02.Build.md, 4-Deploy.md, solutions.md, talk.md"
      When the course is validated
      Then the finding for "topic-01/lab-01/4-Deploy.md" shall offer the rename to "topic-01/lab-01/04.Deploy.md"
      And the finding for "topic-01/lab-01/solutions.md" shall next offer the rename to "topic-01/lab-01/05.solutions.md"
      And the finding for "topic-01/lab-01/talk.md" shall then offer the rename to "topic-01/lab-01/06.talk.md"
      And once the fixes are applied the lab shall have no V004 finding
