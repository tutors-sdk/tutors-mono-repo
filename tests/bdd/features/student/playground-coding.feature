@student @ears-ubiquitous @ears-event-driven @ears-state-driven @ears-optional @ears-unwanted
Feature: Playground Coding
  As a student working through an exercise
  I want to write and run code in the page I am reading
  So that I can practise without installing anything or signing in

  @ears-ubiquitous
  Scenario: Student code never runs on the reader's own origin
    Given a student opens a playground
    Then the system shall run the code in a frame that cannot reach the reader's origin
    And the system shall address that frame with a token of its own
    And the system shall ignore run-time messages from anywhere else on the page

  @ears-event-driven
  Scenario: Run the code in the workspace
    Given a student opens a playground
    When the student runs the code
    Then the system shall send the whole workspace to the run-time
    And the system shall show output as it arrives
    And the system shall report whether the run succeeded

  @ears-event-driven
  Scenario: Run the checks the lecturer wrote
    Given a playground with a tests file
    When the student runs the checks
    Then the system shall send the tests alongside the student's files
    And the system shall keep the tests out of the student's own workspace

  @ears-state-driven
  Scenario: Work is kept between visits without an account
    While a student has edited a playground before
    Then the system shall reopen the exercise with their edits in place
    And the system shall keep the files the student created themselves

  @ears-event-driven
  Scenario: The lecturer adds a file to an exercise already started
    Given a student has saved edits to a playground
    When the lecturer adds a file to the exercise
    Then the system shall deliver the new file to the student
    And the system shall leave the student's edits alone

  @ears-optional
  Scenario: Scaffolding the student is not meant to change
    Where the author marked a file read-only
    Then the system shall present that file as read-only
    And the system shall ship the current version of it rather than a stored copy

  @ears-event-driven
  Scenario: Share a workspace with someone who is not signed in
    Given a student has a workspace they want to show someone
    When the student shares it as a link
    Then the system shall carry the whole workspace in the link
    And the system shall keep the link's payload in the fragment, out of the network

  @ears-unwanted
  Scenario: Code that never finishes
    If the code is still running after the time limit
    Then the system shall stop it and say so
    And the system shall discard the run-time rather than leave it stuck

  @ears-unwanted
  Scenario: A student changes their mind mid-run
    If the student presses stop
    Then the system shall answer the waiting run rather than leave the page busy

  @ears-unwanted
  Scenario: A shared link that is not one
    If a link's fragment is not a workspace
    Then the system shall fall back to the exercise as authored
