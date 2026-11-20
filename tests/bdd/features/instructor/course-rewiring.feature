@instructor
Feature: Rewiring a course for compliance
  As an instructor
  I want to reorder, move, retitle, hide and remove items and keep a course Tutors accepts
  So that arranging a course never leaves a folder Tutors skips or a name it rejects

  The planners live in @tutors/course-rules (packages/jsr/course-rules/src/rewire.ts), beside planFixes, so
  `tutors rewire` (packages/jsr/create/src/rewire-cli.ts) and Tutors Studio plan the same file operations.
  A plan only moves and writes; removing an item moves it into the course's .tutors-bin folder, which the
  generator never reads. Scenarios run the command over a course on disk and build it with the generator.

  @rule-0745 @ears-event-driven
  Rule: When an instructor runs tutors validate with --plan, tutors shall print the safe fixes as a JSON array of file operations and change nothing.

    Scenario: A capitalised talk folder
      Given a course of two topics whose first topic holds a folder "talk-Intro"
      When the instructor runs tutors validate on it with "--plan"
      Then the output shall parse as a JSON array holding a move from "topic-01/talk-Intro" to "topic-01/talk-intro"
      And the folder "topic-01/talk-Intro" shall still be there

  @rule-0746 @ears-event-driven
  Rule: When an instructor reorders the items of one kind in a folder with tutors rewire, tutors shall renumber their folders in the new order and keep each folder's name after its number.

    Scenario: Two talks swapped
      Given a course of two topics whose first topic holds talks "talk-01-html" and "talk-02-css"
      When the instructor runs tutors rewire "reorder topic-01 talk-02-css talk-01-html"
      Then the first topic shall hold talks "talk-01-css" and "talk-02-html"
      And validating the course shall find no errors

  @rule-0747 @ears-unwanted
  Rule: If an instructor asks tutors rewire to reorder items of different kinds, then tutors shall change nothing and say that Tutors groups a folder's items by kind.

    Scenario: A talk put before a lab
      Given a course of two topics whose first topic holds talks "talk-01-html" and "talk-02-css"
      And the first topic holds a lab "lab-01-setup"
      When the instructor runs tutors rewire "reorder topic-01 lab-01-setup talk-01-html talk-02-css"
      Then the error output shall include "grouped by kind"
      And the exit status shall be 1

  @rule-0748 @ears-event-driven
  Rule: When an instructor moves an item into another topic with tutors rewire, tutors shall give it the next free number of its kind there.

    Scenario: A talk moved to the second week
      Given a course of two topics whose first topic holds talks "talk-01-html" and "talk-02-css"
      And the second topic holds a talk "talk-01-intro"
      When the instructor runs tutors rewire "move topic-01/talk-02-css topic-02"
      Then the second topic shall hold talks "talk-01-intro" and "talk-02-css"
      And validating the course shall find no errors

  @rule-0749 @ears-unwanted
  Rule: If an instructor moves an item into a folder where Tutors does not show that kind, then tutors shall change nothing and say where that kind of item can go.

    Scenario: A topic moved into another topic
      Given a course of two topics
      When the instructor runs tutors rewire "move topic-02 topic-01"
      Then the error output shall include "Tutors won't show a Topic inside a Topic"
      And the exit status shall be 1

  @rule-0750 @ears-event-driven
  Rule: When an instructor retitles an item with tutors rewire, tutors shall rewrite only the title line of the page Tutors takes the item's title from.

    Scenario: A talk with front matter and a body
      Given a course of two topics whose first topic holds a talk "talk-01-html" whose page has front matter, the title "Old" and a paragraph
      When the instructor runs tutors rewire "retitle topic-01/talk-01-html" with the title "HTML basics"
      Then the talk's page shall keep its front matter and paragraph under the title "# HTML basics"

  @rule-0751 @ears-unwanted
  Rule: If an instructor asks tutors rewire to hide an item inside a topic, then tutors shall change nothing and say that Tutors hides only whole topics and units at the top of the course.

    Scenario: Hiding a talk
      Given a course of two topics whose first topic holds talks "talk-01-html" and "talk-02-css"
      When the instructor runs tutors rewire "hide topic-01/talk-01-html"
      Then the error output shall include "Tutors can hide only a whole topic or unit"
      And the exit status shall be 1

    Scenario: Hiding a week
      Given a course of two topics
      When the instructor runs tutors rewire "hide topic-02"
      Then properties.yaml shall list "topic-02" under ignore
      And the generator shall mark "topic-02" hidden

  @rule-0752 @ears-event-driven
  Rule: When an instructor removes an item with tutors rewire, tutors shall move it into the course's .tutors-bin folder, which the generator never reads, and delete nothing.

    Scenario: A talk removed and put back
      Given a course of two topics whose first topic holds talks "talk-01-html" and "talk-02-css"
      When the instructor runs tutors rewire "remove topic-01/talk-01-html"
      Then the folder ".tutors-bin/talk-01-html" shall hold the talk's files
      And the generator shall not show "talk-01-html"
      When the instructor then runs tutors rewire "restore talk-01-html topic-01"
      Then the first topic shall hold talks "talk-01-html" and "talk-02-css"

  @rule-0753 @ears-event-driven
  Rule: When an instructor runs tutors rewire with --plan, tutors shall print the plan as JSON and change nothing.

    Scenario: Planning a swap
      Given a course of two topics whose first topic holds talks "talk-01-html" and "talk-02-css"
      When the instructor runs tutors rewire "reorder topic-01 talk-02-css talk-01-html --plan"
      Then the output shall parse as JSON with 4 operations
      And the first topic shall hold talks "talk-01-html" and "talk-02-css"
