@instructor
Feature: Creating a course from a teaching pattern
  As an instructor new to Tutors
  I want to answer three questions and get a whole course
  So that I make three decisions instead of twelve and only ever drop content in afterwards

  The patterns are data in packages/jsr/create/src/patterns.ts: lecture-lab, lecture-only, project-based and
  flipped. generateCourseFiles builds the course when CourseSpec.pattern is set; `tutors-create --pattern`
  is the command-line route and Tutors Studio's three-question start is the other.

  @rule-0706 @ears-event-driven
  Rule: When an instructor creates a course from a pattern, tutors shall generate one topic per teaching week, grouped four weeks to a unit, each holding the learning objects the pattern names.

    Scenario: Twelve weeks of lecture and lab
      Given the pattern "lecture-lab" for 12 weeks from "2027-01-25"
      When the course is generated
      Then it shall have 12 topics in 3 units
      And topic "unit-2/topic-05" shall hold "lab-01, talk-01"
      And the side unit shall hold "note-01, talk-01"

    Scenario: Flipped weeks hold pre-reading, a lecture and a lab
      Given the pattern "flipped" for 6 weeks from "2027-01-25"
      When the course is generated
      Then it shall have 6 topics in 2 units
      And topic "unit-2/topic-06" shall hold "lab-01, note-01, talk-01"

  @rule-0707 @ears-event-driven
  Rule: When an instructor creates a course from a pattern with a start date, tutors shall write a calendar.yaml dating each teaching week a week apart from the start, with the reading week as an undated-topic break.

    Scenario: A reading week after week 6 pushes the second half back
      Given the pattern "lecture-only" for 12 weeks from "2027-01-25" with a reading week after week 6
      When the course is generated
      Then the calendar shall date week 1 "2027-01-25", week 6 "2027-03-01" and week 7 "2027-03-15"
      And the calendar shall hold a "Reading Week" dated "2027-03-08"

  @rule-0708 @ears-ubiquitous
  Rule: Tutors shall generate every pattern's course so that tutors validate reports no findings on it.

    Scenario Outline: Each pattern validates clean
      Given the pattern "<pattern>" for 13 weeks from "2027-09-20" with a reading week after week 7
      When the course is generated
      Then tutors validate shall report no findings
      And gen shall build a learning object for every generated folder

      Examples:
        | pattern       |
        | lecture-lab   |
        | lecture-only  |
        | project-based |
        | flipped       |

  @rule-0709 @ears-unwanted
  Rule: If an instructor names a pattern that does not exist, then tutors shall list the four patterns and create nothing.

    Scenario: A misspelt pattern
      Given an empty output folder for the course creator
      When the instructor runs the course creator with "--pattern lab-lecture --name Web --start 2027-01-25"
      Then the creator shall list the patterns "lecture-lab, lecture-only, project-based, flipped"
      And the output folder shall still be empty
