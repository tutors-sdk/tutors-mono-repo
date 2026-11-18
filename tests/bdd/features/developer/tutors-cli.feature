@developer
Feature: One tutors program
  As Tutors Studio, which bundles the Tutors tools, and as a lecturer without Deno
  I want one compiled tutors program whose commands run the generator, tutors-lite and tutors-create
  So that Studio ships one tools file per platform and a course builds the same way with or without Deno

  Issue #603 (M6 of #599). packages/jsr/tutors-cli is a thin front door: each command imports the package
  that does the work, so `deno run jsr:@tutors/tutors` and `tutors build` run the same code.

  @rule-0777 @ears-ubiquitous
  Rule: Tutors shall run the generator for tutors build, tutors-lite for tutors website, and tutors-create for tutors validate, tutors import and tutors create, passing every later argument to the command.

    Scenario Outline: Each command names its package's work
      When the tutors program is given "<args>"
      Then it runs the "<command>" command
      And it passes "<rest>" to the command

      Examples:
        | args                                  | command  | rest                            |
        | build                                 | build    |                                 |
        | website                               | website  |                                 |
        | validate courses/web --format json    | validate | courses/web --format json       |
        | import material --name Web            | import   | material --name Web             |
        | create --pattern lecture-and-lab      | create   | --pattern lecture-and-lab       |

    Scenario: The version names what is inside
      When the tutors program is given "--version"
      Then it runs the "version" command

    Scenario: An unknown command shows the usage
      When the tutors program is given "bulid"
      Then it shows the usage, naming "bulid" as unknown
      And the usage lists build, website, validate, import and create

  @rule-0778 @ears-event-driven
  Rule: When a Tutors release is published, tutors shall attach the tutors program compiled for each target in packages/jsr/tutors-cli/targets.json, with a SHA256SUMS of every file it attaches.

    Scenario: Windows x64 is a target, with an .exe name
      Given the targets the tutors program is compiled for
      Then "x86_64-pc-windows-msvc" is a target named "tutors-x86_64-pc-windows-msvc.exe"
      And every target's file name starts with "tutors-" and names its target

    Scenario: The release workflow compiles each target and sums the files
      Given the tutors program release workflow
      Then it compiles every key of targets.json with deno compile
      And it writes and checks a SHA256SUMS before attaching the files
      And the release candidate dispatch calls it for the candidate's tag
