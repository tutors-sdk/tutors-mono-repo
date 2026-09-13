@instructor @ears-ubiquitous @ears-event-driven @ears-state-driven @ears-optional @ears-unwanted
Feature: SCORM Export
  As an instructor whose institution mandates LMS delivery
  I want to package a Tutors course as a SCORM zip
  So that my students can take the course inside Moodle, Canvas or Blackboard

  @ears-event-driven
  Scenario: SCORM 1.2 packages use the 1.2 profile
    Given an instructor has authored a course
    When the course is exported as SCORM 1.2
    Then the system shall declare schema version 1.2 in the manifest
    And the system shall use the SCORM 1.2 content packaging namespace
    And the system shall spell the SCO attribute with a lowercase t

  @ears-event-driven
  Scenario: SCORM 2004 packages use the 2004 profile
    Given an instructor has authored a course
    When the course is exported as SCORM 2004
    Then the system shall declare schema version 2004 4th Edition in the manifest
    And the system shall use the SCORM 2004 content packaging namespace
    And the system shall spell the SCO attribute with a capital T
    And the system shall declare that the content sets its own completion

  @ears-ubiquitous
  Scenario: Every packaged file is declared
    Given an instructor has authored a course
    Then the system shall list every packaged file as a file of the launchable resource
    And the system shall list the launch file exactly once

  @ears-ubiquitous
  Scenario: Course titles are safe in XML
    Given a course titled "Maths & <Physics>"
    Then the system shall escape the title rather than emit invalid XML

  @ears-event-driven
  Scenario: Completion is reported once the whole course has been seen
    Given a packaged course of 8 pages
    When the learner has visited every page
    Then the system shall report the course as completed
    And the system shall report full progress to a 2004 LMS

  @ears-event-driven
  Scenario: Session time is reported in the format each profile requires
    Given a packaged course
    When the learner closes the page after 65 seconds
    Then the system shall report "00:01:05.00" to a SCORM 1.2 LMS
    And the system shall report "PT1M5S" to a SCORM 2004 LMS

  @ears-state-driven
  Scenario: Partial progress is reported as incomplete
    Given a packaged course of 8 pages
    While the learner has visited only 3 of them
    Then the system shall report the course as incomplete
    And the system shall suspend rather than end the attempt when the learner leaves
    And the system shall preserve the visited pages for the next attempt

  @ears-state-driven
  Scenario: A resumed attempt reopens where the learner left off
    Given a packaged course
    While the learner has a suspended attempt with a saved location
    Then the system shall reopen the page the learner left off at

  @ears-optional
  Scenario: The exported profile is configurable
    Where a course declares a scorm version in its properties
    Then the system shall emit only that profile
    And the system shall emit both profiles when no version is declared
    And the system shall use a declared identifier in the manifest

  @ears-unwanted
  Scenario: Republishing must not misreport existing learners
    If a learner's saved progress was recorded against a different page count
    Then the system shall treat the progress as unset rather than report nonsense
    And the system shall treat unreadable saved progress as unset
