Feature: Course PIN
  As an instructor
  I want the time dashboard to read my course's PIN from wherever the course is served
  So that I can open a course that is not hosted on Netlify

  @rule-0603 @ears-event-driven
  Rule: When an instructor opens a course, the time dashboard shall read the course PIN from the tutors.json of the host that serves the course.

    Scenario: A course served from its own domain
      Given the course "course.example.org" publishes the PIN "1234" in its tutors.json
      When an instructor opens the course "course.example.org" in the time dashboard
      Then the time dashboard shall read the PIN from "https://course.example.org/tutors.json"
      And the course PIN shall be "1234"

    Scenario: A course id with no domain is served from Netlify
      Given the course "example-course" publishes the PIN "5678" in its tutors.json
      When an instructor opens the course "example-course" in the time dashboard
      Then the time dashboard shall read the PIN from "https://example-course.netlify.app/tutors.json"
      And the course PIN shall be "5678"

    Scenario: A course served from a local machine
      Given the course "localhost:3000" publishes the PIN "4321" in its tutors.json
      When an instructor opens the course "localhost:3000" in the time dashboard
      Then the time dashboard shall read the PIN from "http://localhost:3000/tutors.json"
      And the course PIN shall be "4321"
