@instructor
Feature: Contextual feedback
  As a lecturer
  I want to attach feedback to a lab step, for one student or for everyone working on it
  So that a student sees my explanation where it applies, and nobody else can post as me

  An annotation is anchored to one lab step and addressed to one student or everyone on the step;
  one for everyone is a broadcast. Only an educator the course's published enrollment lists may
  post. The reader's server keeps annotations in Supabase's feedback_annotations with the
  service-role key, as the person signed in; the table is closed to the anon key. These Rules
  drive the reader's /api/feedback handler over an in-memory store; the banner, the cards and the
  history on a lab step are in student/step-feedback.feature.

  Background:
    Given the course "cs101" is published with "ellen" as its educator
    And the step "02" of the lab "/lab/cs101/lab-01"

  @rule-0400 @ears-ubiquitous
  Rule: Tutors shall anchor an annotation to one lab step, with an audience of one student or everyone on the step.

    Scenario: An annotation for one student
      When "ellen" annotates the step for "alice"
      Then the reader shall answer 201
      And the annotation shall be at the step "02" of the lab "/lab/cs101/lab-01" for "alice"

    Scenario: An annotation for everyone on the step
      When "ellen" annotates the step for everyone on the step
      Then the reader shall answer 201
      And the annotation shall be at the step "02" of the lab "/lab/cs101/lab-01" for "everyone"

    Scenario: Two audiences are refused
      When "ellen" annotates the step for "alice" and everyone on the step
      Then the reader shall answer 400
      And tutors shall have stored no annotation

    Scenario: No audience is refused
      When "ellen" annotates the step for nobody
      Then the reader shall answer 400
      And tutors shall have stored no annotation

  @rule-0401 @ears-event-driven
  Rule: When an educator posts an annotation, tutors shall store it with the author and the time.

    Scenario: An annotation is stored as the educator's, at the time it was posted
      Given the clock reads "2026-01-05T10:15:00.000Z"
      When "ellen" annotates the step for everyone on the step
      Then tutors shall have stored the annotation by "ellen" at "2026-01-05T10:15:00.000Z"

  @rule-0402 @ears-unwanted
  Rule: If an actor who is not in the course's educator list posts an annotation, then tutors shall refuse it with 403 and store nothing.

    Scenario: A student cannot annotate
      When "alice" annotates the step for everyone on the step
      Then the reader shall answer 403
      And tutors shall have stored no annotation

    Scenario: A student cannot revoke
      Given "ellen" has annotated the step for everyone on the step
      When "alice" revokes the annotation
      Then the reader shall answer 403
      And the annotation shall not be revoked

  @rule-0565 @ears-ubiquitous
  Rule: Tutors shall keep and change lecturer feedback only on the reader's server as the signed-in actor, refusing a visitor who is not signed in with 401, and give a student only the broadcasts and the annotations addressed to them.

    Scenario: A visitor who is not signed in is refused
      When a visitor who is not signed in annotates the step for everyone on the step
      Then the reader shall answer 401
      And tutors shall have stored no annotation

    Scenario: A student reads the broadcast and their own annotation, never another student's
      Given "ellen" has annotated the step for "alice" with "For alice."
      And "ellen" has annotated the step for "bob" with "For bob."
      And "ellen" has annotated the step for everyone on the step with "For everyone."
      When "alice" reads the step
      Then the reader shall answer with the broadcast "For everyone." and the annotation "For alice." only

    Scenario: The table is closed to the anon key every browser holds
      Then the feedback migration shall turn row level security on with no policy for the anon key

    Scenario: A server without the service-role key keeps no feedback
      Given the reader's server has no service-role key
      When "ellen" annotates the step for everyone on the step
      Then the reader shall answer 503

  @rule-0567 @ears-unwanted
  Rule: If a signed-in reader is not admitted to a private course, then the reader shall refuse with 403 to read feedback there.

    A private course (auth level 1 with a whitelist) admits its educators and the logins on its
    whitelist, as the reader's pages do.

    Scenario: An outsider reads nothing from a private course
      Given the course "cs101" is private, admitting "alice"
      And "ellen" has annotated the step for everyone on the step with "A private hint."
      When "mallory" reads the step
      Then the reader shall answer 403

    Scenario: An outsider reads none of what was received in a private course
      Given the course "cs101" is private, admitting "alice"
      When "mallory" reads the feedback they received in the course
      Then the reader shall answer 403

    Scenario: A student on the whitelist reads the course's feedback
      Given the course "cs101" is private, admitting "alice"
      And "ellen" has annotated the step for everyone on the step with "A private hint."
      When "alice" reads the step
      Then the reader shall answer 200
