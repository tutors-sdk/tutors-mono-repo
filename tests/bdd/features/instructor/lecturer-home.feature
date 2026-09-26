@instructor
Feature: Lecturer home page
  As a lecturer
  I want the courses I teach listed apart from the courses I study on my home page
  So that I can get to my own courses and their class activity first

  A lecturer is an educator of a course: a GitHub login in the course's enrollment.yaml
  educators, or in PRIVATE_TUTORS_ADMINS (guides/RBAC.md). The home page lists courses from the
  lecturer's own profile, so a course appears once they have opened it.

  Background:
    Given the course "web-dev-101" is published with "eve" as its educator
    And the course "databases-101" is published with "sam" as its educator

  @rule-0154 @ears-state-driven
  Rule: While a signed-in user is an educator of a course in their profile, the reader shall list that course under Teaching on the home page.

    @active
    Scenario: A lecturer sees the course they teach under Teaching
      Given "eve" is signed in and has opened "web-dev-101" and "databases-101"
      When the home page loads for "eve"
      Then Teaching lists "web-dev-101" and not "databases-101"

    @inactive
    Scenario: A student sees no Teaching
      Given "alice" is signed in and has opened "web-dev-101" and "databases-101"
      When the home page loads for "alice"
      Then Teaching lists no course
