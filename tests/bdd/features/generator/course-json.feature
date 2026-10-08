@developer
Feature: Course JSON from the generator
  As a maintainer of Tutors
  I want what the tutors generator writes to be pinned before it reaches a lecturer or a reader
  So that a change to tutors.json is a decision we make, not one we find out about after release

  tutors.json is the file the tutors generator (packages/jsr/tutors) writes and the reader fetches. Its contract is
  TUTORS_JSON_SCHEMA in @tutors/tutors-types (packages/jsr/types/src/tutors-json.ts), also published as
  packages/jsr/types/tutors-json.schema.json for the release harness. The scenarios run parseCourse over the committed
  synthetic corpus course (tests/generator/corpus/synthetic-course), which holds every learning-object kind. The reader's
  side of these files, opening what earlier generator releases wrote, is Rule 0269 in features/course/course-json-history.feature.

  Background:
    Given the synthetic corpus course has been generated

  @rule-0262 @ears-ubiquitous
  Rule: Tutors shall write a tutors.json that conforms to the tutors.json schema in @tutors/tutors-types.

    Scenario: The synthetic course conforms to the schema
      Then the tutors.json has no schema errors
      And it holds every learning-object kind the corpus authors: "topic, unit, side, lab, step, talk, tutorial, note, web, github, archive, panelnote, paneltalk, panelvideo, podcast, notebook, whiteboard"

    Scenario: A field the schema does not name is refused
      Given the generator also wrote the field "planted" on the first topic
      Then the schema reports "/los/[topic-01-typical] has a field the schema does not allow: planted"

    Scenario: A missing route is refused
      Given the generator left out the route of the second topic
      Then the schema reports "/los/[topic-02-side] must have required property 'route'"

  @rule-0263 @ears-ubiquitous
  Rule: Tutors shall address every file of a course in tutors.json through the {{COURSEURL}} placeholder, so one build serves every host the course is published on.

    Scenario: Images, PDFs and whiteboards point at the placeholder
      Then every img, pdf and excalidraw value that is set starts with "https://{{COURSEURL}}/"
      And every route that is not a web or github link carries "/{{COURSEURL}}"

  @rule-0264 @ears-event-driven
  Rule: When a lecturer builds a lab, tutors shall write one step per markdown file in file-name order, each with the lab's route followed by the step's short title.

    Scenario: The steps of a lab
      Then the lab "book-a" has the steps "Lab-1, Install, Ünïcödé"
      And each step of the lab "book-a" has the lab's route followed by its id

  @rule-0265 @ears-event-driven
  Rule: When properties.yaml lists a topic under ignore, tutors shall write that topic with hide set to true rather than leave it out.

    Scenario: An ignored topic is written hidden
      Then the topic "topic-09-hidden" is in the tutors.json with hide set to true
      And no other topic has hide set to true

  @rule-0266 @ears-event-driven
  Rule: When a course folder holds properties.yaml, calendar.yaml or enrollment.yaml, tutors shall copy each into tutors.json as properties, calendar and enrollment, unchanged.

    Scenario Outline: Course YAML is copied as written
      Then "<key>" in the tutors.json equals the course's "<file>"

      Examples:
        | key        | file            |
        | properties | properties.yaml |
        | calendar   | calendar.yaml   |
        | enrollment | enrollment.yaml |

  @rule-0267 @ears-ubiquitous
  Rule: Tutors shall leave out of tutors.json every folder whose name starts with no learning-object kind.

    Scenario: A drafts folder is left out
      Then no learning object in the tutors.json has the id "drafts"

  @rule-0268 @ears-event-driven
  Rule: When a pull request changes the generator, tutors shall fail the generator differential unless every difference in the corpus output is claimed in tests/generator/claims.yaml.

    Scenario: An unclaimed difference fails
      Given the candidate generator changed the title of "topic-01-typical"
      When the differential compares it with the base
      Then the difference "/los/[topic-01-typical]/title" is unclaimed

    Scenario: A claimed difference passes
      Given the candidate generator changed the title of "topic-01-typical"
      And claims.yaml claims "**/title" in "tutors.json" because "Rule 0268 example"
      When the differential compares it with the base
      Then no difference is unclaimed
