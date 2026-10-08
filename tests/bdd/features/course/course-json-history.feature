Feature: Course JSON from earlier generator releases
  As a student
  I want a course to open whichever generator release my lecturer built it with
  So that a reader release never breaks a course nobody has rebuilt

  Lecturers build with `deno run -A jsr:@tutors/tutors`, and a course stays published as built, so live courses carry
  tutors.json from many generator releases at once. tests/fixtures/tutors-json-history holds the tutors.json each
  published release writes for the synthetic corpus course (build.ts there regenerates them from JSR). Files from
  releases before 4.2.20 do not meet today's schema (tutorials without pdf, podcasts without episode), and 4.x releases
  wrote the notebook as a note and the whiteboard as a topic, because they predate both kinds. That is the point: the
  reader has to open them anyway.

  Units and sides share their topic's route and are reached through it; lab steps through their lab. Web, GitHub,
  video and archive routes leave the course, so they are not looked up by route.

  @rule-0269 @ears-event-driven
  Rule: When a student opens a course whose tutors.json a published generator release wrote, the reader shall load it and reach every learning object by its route.

    Scenario Outline: Open the synthetic course as generator <release> wrote it
      Given the course host serves the tutors.json that generator "<release>" wrote
      When the reader loads the course
      Then the course loads with the 6 topics the generator wrote
      And every topic and every learning object inside the course is reachable by its route
      And no route in the course carries an unresolved course placeholder
      And the topic "topic-09-hidden" is hidden

      Examples:
        | release |
        | 4.1.0   |
        | 4.2.0   |
        | 4.2.20  |
        | 5.0.0   |
        | 5.1.2   |
        | 5.2.3   |
        | 5.3.0   |
