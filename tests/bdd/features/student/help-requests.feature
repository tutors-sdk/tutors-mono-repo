@student
Feature: Help requests in labs
  As a student working through a lab
  I want to say I am stuck, ask for a hint or ask for the lecturer from the step I am on
  So that help comes to where I am without a separate messaging system

  A signed-in student raises one help request per course; it carries the step, the kind and the
  time. These Rules drive the Assistance use cases over in-memory adapters; the reader's server
  routes and the Supabase store are shared/help-request-server.feature, and the help control on the
  lab step is student/help-button.feature.

  Background:
    Given "alice" is signed in and on the step "02" of the lab "/lab/cs101/lab-01" in the course "cs101"

  @rule-0385 @ears-event-driven
  Rule: When a signed-in student on a lab step asks for help as stuck, needing a hint or needing the lecturer, tutors shall open one help request carrying the step reference, the kind and the time of the request.

    Scenario Outline: A student asks for help
      When "alice" asks for help as "<kind>" at "2026-01-05T09:00:00.000Z"
      Then tutors shall hold one open help request by "alice" at the step "02" of kind "<kind>" requested at "2026-01-05T09:00:00.000Z"

      Examples:
        | kind     |
        | stuck    |
        | hint     |
        | lecturer |

  @rule-0386 @ears-unwanted
  Rule: If a student asks for help while one of their requests is open or acknowledged in the course, then tutors shall replace its kind and keep the original request time.

    Scenario: Asking again changes the kind
      Given "alice" asked for help as "stuck" at "2026-01-05T09:00:00.000Z"
      When "alice" asks for help as "lecturer" at "2026-01-05T09:04:00.000Z"
      Then tutors shall hold one open help request by "alice" at the step "02" of kind "lecturer" requested at "2026-01-05T09:00:00.000Z"

    Scenario: Asking again after an acknowledgement keeps the request
      Given "alice" asked for help as "hint" at "2026-01-05T09:00:00.000Z"
      And the lecturer "ellen" acknowledged it
      When "alice" asks for help as "lecturer" at "2026-01-05T09:06:00.000Z"
      Then tutors shall hold one acknowledged help request by "alice" of kind "lecturer" requested at "2026-01-05T09:00:00.000Z"
