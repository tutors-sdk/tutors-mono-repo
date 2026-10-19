@developer
Feature: Static HTML build with tutors-lite
  As a lecturer or a publishing script running tutors-lite
  I want a failed build to end with a failing exit status
  So that a partial html/ folder is never published as if it were complete

  tutors-lite (packages/jsr/tutors-lite) builds a course folder into html/. CI and publishing scripts read only its
  exit status, so that status is the contract. The scenarios run the tutors-lite build (runTutorsLite, which main.ts
  calls) over a small course written to a temporary folder. The same outcomes are proved against the real CLI process,
  and with a template that throws while rendering, by packages/jsr/tutors-lite/test/run.test.ts under Deno.

  @rule-0661 @ears-unwanted
  Rule: If static generation of a course fails, then tutors shall end the tutors-lite build with a nonzero exit status and leave the course's assets uncopied.

    Scenario: Templates that cannot be loaded fail the build
      Given a course folder holding course.md, a topic and the image "topic-01/topic.png"
      When tutors-lite builds the course with templates from a folder that does not exist
      Then the build ends with exit status 1
      And no assets are copied into html/

    Scenario: A completed build copies the assets and exits zero
      Given a course folder holding course.md, a topic and the image "topic-01/topic.png"
      When tutors-lite builds the course with its own templates
      Then the build ends with exit status 0
      And "html/topic-01/topic.png" is in the course folder

  @rule-0662 @ears-unwanted
  Rule: If the folder tutors-lite runs in holds no course.md, then tutors shall end the build with a nonzero exit status and report that course.md cannot be located.

    Scenario: A folder without course.md fails the build
      Given a course folder with no course.md
      When tutors-lite builds the course with its own templates
      Then the build ends with exit status 1
      And the build reports "Cannot locate course.md"
      And no html/ folder is written
