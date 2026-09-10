@instructor @ears-ubiquitous @ears-event-driven @ears-state-driven @ears-optional @ears-unwanted
Feature: Playground Authoring and Review
  As an instructor setting a programming exercise
  I want a folder of code to become a runnable exercise, and to see what students made of it
  So that I can set practical work without running a server for it

  @ears-event-driven
  Scenario: A folder of code becomes an exercise
    Given an instructor writes a playground folder holding a single Python file
    When the course is built
    Then the system shall make that file the entry point
    And the system shall choose the run-time from the entry point's extension
    And the system shall need no configuration file to do so

  @ears-ubiquitous
  Scenario: The workspace holds what the exercise needs and nothing else
    Given a playground folder of source, data and prose files
    Then the system shall carry the source and data files into the workspace
    And the system shall leave the prose out of it
    And the system shall list the entry point first

  @ears-event-driven
  Scenario: Checks the student can run but not edit
    Given a playground folder holding a test file
    When the course is built
    Then the system shall keep the tests out of the student's workspace
    And the system shall carry the tests separately so the student can run them

  @ears-optional
  Scenario: The defaults can be overridden
    Where a playground folder declares a playground.yaml
    Then the system shall take the run-time, entry point and packages from it
    And the system shall treat the file it names as the tests
    And the system shall mark the files it names as read-only

  @ears-unwanted
  Scenario: An exercise that would be a large download
    If a file in a playground folder is too large to inline
    Then the system shall leave it out rather than ship it to every student
    And the system shall build the rest of the workspace anyway

  @ears-state-driven
  Scenario: Reviewing what students handed in
    While an instructor teaches the course
    Then the system shall let them read the submissions for an exercise
    And the system shall present a submission with the output the student last saw

  @ears-unwanted
  Scenario: A student cannot make themselves an instructor
    If the page claims a student teaches the course
    Then the system shall believe only the claim the reader signed
    And the system shall keep the submissions table closed to the anonymous role
    And the system shall let an instructor read submissions without letting them write any

  @ears-unwanted
  Scenario: A deployment with no Supabase secret
    If the reader cannot mint a run-time token
    Then the system shall offer no handing in at all
    And the system shall leave the exercise itself working
