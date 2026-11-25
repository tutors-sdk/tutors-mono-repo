@instructor
Feature: Validating a course from the command line
  As an instructor
  I want one command that checks my course folder
  So that I, my CI and Tutors Studio see the same problems before I publish

  The command is `deno run -A jsr:@tutors/tutors-create validate [folder]` (packages/jsr/create/src/validate-cli.ts),
  printing what @tutors/course-rules finds.

  @rule-0701 @ears-event-driven
  Rule: When an instructor runs tutors validate on a course folder, tutors shall print each finding with its path and message and exit with status 1 if any finding is an error, else status 0.

    Scenario: A course with a misnamed week
      Given a generated course with a folder "Week 3" holding a topic
      When the instructor runs tutors validate on it
      Then the output shall include "error V002 Week 3: The folder"
      And the exit status shall be 1

    Scenario: A freshly generated course
      Given a generated course
      When the instructor runs tutors validate on it
      Then the output shall be "Everything checks out."
      And the exit status shall be 0

  @rule-0702 @ears-optional
  Rule: Where the format json is chosen for tutors validate, tutors shall print the findings as a JSON array of objects carrying rule, severity, path and message.

    @active
    Scenario: JSON for Studio and CI
      Given a generated course with a folder "Week 3" holding a topic
      When the instructor runs tutors validate on it with "--format json"
      Then the output shall parse as a JSON array whose first item has rule "V002" and path "Week 3"

    @inactive
    Scenario: Text when no format is chosen
      Given a generated course with a folder "Week 3" holding a topic
      When the instructor runs tutors validate on it
      Then the output shall not parse as JSON

  @rule-0703 @ears-optional
  Rule: Where the format sarif is chosen for tutors validate, tutors shall print a SARIF 2.1.0 log with one result per finding, located at the file or folder at fault.

    @active
    Scenario: SARIF for code scanning
      Given a generated course with a folder "Week 3" holding a topic
      When the instructor runs tutors validate on it with "--format sarif"
      Then the output shall be a SARIF 2.1.0 log with one result, rule "V002" at "Week 3"

    @inactive
    Scenario: No SARIF unless asked for
      Given a generated course with a folder "Week 3" holding a topic
      When the instructor runs tutors validate on it with "--format json"
      Then the output shall not mention SARIF

  @rule-0704 @ears-optional
  Rule: Where strict checking is chosen for tutors validate, tutors shall exit with status 2 when the course has warnings and no errors.

    @active
    Scenario: A warning fails a strict check
      Given a course whose only finding is a warning
      When the instructor runs tutors validate on it with "--strict"
      Then the exit status shall be 2

    @inactive
    Scenario: A warning passes an ordinary check
      Given a course whose only finding is a warning
      When the instructor runs tutors validate on it
      Then the exit status shall be 0

  @rule-0705 @ears-unwanted
  Rule: If tutors validate cannot read the course folder, then tutors shall print the reason and exit with status 3.

    Scenario: A folder that is not there
      Given a folder that does not exist
      When the instructor runs tutors validate on it
      Then the error output shall begin "Couldn't read the course folder"
      And the exit status shall be 3

  @rule-0764 @ears-unwanted
  Rule: If tutors validate prints a text report holding findings that its --fix option can fix, then tutors shall end the report by saying how many and naming tutors validate --fix.

    Courses written before validate ran in every Netlify deploy (mono-repo #591) often fail only on renames, so the
    deploy log says that one command fixes them.

    @active
    Scenario: A misnamed week the fix renames
      Given a generated course with a folder "Week 3" holding a topic
      When the instructor runs tutors validate on it
      Then the output shall include "can be fixed for you: run tutors validate --fix."

    @inactive
    Scenario: A clean course says nothing about fixes
      Given a generated course
      When the instructor runs tutors validate on it
      Then the output shall be "Everything checks out."
