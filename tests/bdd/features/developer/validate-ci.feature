@developer
Feature: tutors validate holds on real courses
  As a maintainer of the course rules
  I want CI to show what each change to tutors validate does to real lecturers' courses
  So that a rule change never surprises a lecturer, whose Netlify deploy stops at an error since Rule 0744

  The rule fixtures (tests/fixtures/validate) prove each rule on a course built to break it. These Rules
  prove the rules on courses nobody built for them: the validate corpus (tests/validate-corpus/corpus.yaml,
  real courses pinned by commit) is checked by `pnpm check:validate-corpus` (scripts/checks/validate-corpus.ts)
  against the committed findings in tests/validate-corpus/baseline.json.

  @rule-0758 @ears-event-driven
  Rule: When a change alters what tutors validate reports on a course in the validate corpus, tutors shall fail the validate corpus check and list each finding added or removed, marking each new error as one that stops the course's deploy.

    Scenario: A rule change adds an error to a real course
      Given a corpus course whose baseline has a warning "V007" at "Week 1"
      When tutors validate now also reports an error "V002" at "Scratch"
      Then the validate corpus check shall fail
      And the report shall list "+ error V002 Scratch"
      And the report shall say "a deploy that runs tutors validate stops here"

    Scenario: A rule change removes a finding
      Given a corpus course whose baseline has a warning "V007" at "Week 1"
      When tutors validate now reports nothing
      Then the validate corpus check shall fail
      And the report shall list "- warn V007 Week 1"

    Scenario: The pin moved without a new baseline
      Given a corpus course whose baseline was recorded at another commit
      When tutors validate reports the same findings
      Then the validate corpus check shall fail
      And the report shall say "the baseline was recorded at"

    Scenario: Nothing changed
      Given a corpus course whose baseline has a warning "V007" at "Week 1"
      When tutors validate reports the same findings
      Then the validate corpus check shall pass

  @rule-0759 @ears-unwanted
  Rule: If tutors validate and the generator disagree about which folders of a course are left out, then tutors shall fail the validate corpus check and name each folder they disagree about.

    Scenario: Validate misses a folder the generator drops
      Given a course on disk with a folder "Week 3" holding a topic
      When the check compares the generator with findings that leave out "Week 3"
      Then the validate corpus check shall fail
      And the report shall list "gen drops Week 3, validate says nothing"

    Scenario: Validate warns about a folder the generator builds
      Given a course on disk with a folder "Week 3" holding a topic
      When the check compares the generator with findings that also name "topic-01"
      Then the validate corpus check shall fail
      And the report shall list "validate says topic-01 won't appear, gen builds it"

    Scenario: Validate and the generator agree
      Given a course on disk with a folder "Week 3" holding a topic
      When the check compares the generator with what tutors validate reports
      Then the validate corpus check shall pass

  @rule-0760 @ears-event-driven
  Rule: When tutors validate --fix has run on a course, tutors shall leave a course that a second --fix does not change, with every file's content kept and no rule reporting more errors than before.

    Scenario: Every fixture's broken course settles in one pass
      Given the broken course of every validator fixture
      When each is fixed twice
      Then no fix shall have broken the promise

    Scenario: A fix that keeps finding more to do is caught
      Given a course whose checker always plans one more rename
      When it is fixed twice
      Then the report shall say "a second --fix still changed"

  @rule-0761 @ears-ubiquitous
  Rule: Tutors shall write a tutors validate SARIF report that the SARIF 2.1.0 JSON schema accepts, so GitHub code scanning takes every upload.

    Scenario: Every fixture's broken course
      Given the broken course of every validator fixture
      When each is validated with the format sarif
      Then the SARIF 2.1.0 schema shall accept every report

    Scenario: A course with no findings
      Given a course with no findings
      When it is validated with the format sarif
      Then the SARIF 2.1.0 schema shall accept every report

  @rule-0762 @ears-ubiquitous
  Rule: Tutors shall write a standard netlify.toml naming a tutors-create version range that admits the tutors-create version this repository publishes, so a course deploys with the validate that wrote it.

    Scenario: The template and the package agree
      Given the netlify.toml that tutors writes
      Then its tutors-create range shall admit the version in packages/jsr/create/deno.json
