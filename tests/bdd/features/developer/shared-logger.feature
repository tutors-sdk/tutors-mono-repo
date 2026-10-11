@developer
Feature: Shared logger
  As a maintainer of Tutors
  I want the apps and the Deno packages to log through one logger core
  So that an error in the generator, the model or the time library reaches the same transports as an error in an app

  @tutors/logger-core (packages/jsr/logger-core) holds the levels, child loggers, transports and formats (issue #210).
  @tutors/logger re-exports it and adds the SvelteKit server glue. The command-line tools switch it to short
  human lines; everything else keeps the JSON or pretty format it had.

  @rule-0290 @ears-ubiquitous
  Rule: Tutors shall keep its logger core package free of runtime dependencies, with every import inside the package's own files.

    Scenario: The logger core declares no dependencies
      Given the manifests of the logger core package
      Then its package.json declares no "dependencies, peerDependencies, optionalDependencies"
      And its deno.json declares no imports

    Scenario: The logger core imports only its own files
      Given the source files of the logger core package
      Then every import in them is a relative path to a file inside the package

  @rule-0291 @ears-event-driven
  Rule: When a Deno package reports an error or a warning, tutors shall pass it to every transport added through the logger core or the apps' logger.

    Scenario: A missing course file reaches a transport added through the apps' logger
      Given a transport added through the apps' logger
      When the generator reads a course file that does not exist
      Then the transport receives a "warn" entry "unable to locate file" naming that path

    Scenario: A malformed calendar reaches a transport added through the logger core
      Given a transport added through the logger core
      When the model library loads a course whose calendar has a week with no date
      Then the transport receives an "error" entry "Error loading calendar"

    Scenario: No Deno package writes errors around the logger
      Given the source files of the Deno packages outside the logger core
      Then none of them calls console or writes to process.stderr

  @rule-0292 @ears-state-driven
  Rule: While a command-line tool has switched on CLI output, tutors shall print each log entry as one line of the tool's name, the level, the message, the error and the entry's values.

    @active
    Scenario: The generator CLI prints a short line
      Given CLI output is switched on for "tutors"
      When the logger warns "unable to locate file" with path "topic-01/talk.md"
      Then the console line is "tutors warn: unable to locate file (path=topic-01/talk.md)"

    @inactive
    Scenario: Without CLI output the line stays structured
      Given CLI output is switched off
      When the logger warns "unable to locate file" with path "topic-01/talk.md"
      Then the console line is not "tutors warn: unable to locate file (path=topic-01/talk.md)"
