@journey @reader
Feature: Resilience when a dependency fails
  As a student
  I want the reader to keep working, or to say what went wrong, when a service it depends on fails
  So that a slow course host, data API or GitHub costs me a message, not a page that never loads

  Each scenario is proved by the Playwright journey with the same title, tagged with the Rule id, in
  tests/e2e-stack/journeys/resilience.journey.spec.ts, against the built images. The fault is injected
  where production would meet it: a course host that never answers (course-stalled in
  tests/e2e-stack/compose.yaml), a data API that answers 503 or never answers (the persistence stub's
  /_harness/fault), and GitHub failing the token exchange (the identity stub's /_harness/fault).
  ESI.ts's fault catalogue is the model: each fault names the outcome it must produce and a time bound.

  @rule-0614 @ears-unwanted
  Rule: If a course host has not answered for a course within 15 seconds, then the reader shall show an error page that says the course is unavailable.

    Scenario: A course whose host never answers shows Course Unavailable (exercises Rule 0011)
      Given the course host accepts the request for tutors.json and never answers
      When a student opens the course
      Then within 25 seconds the reader shows the error page "Course Unavailable"

  @rule-0615 @ears-unwanted
  Rule: If the data API is unavailable, then the reader shall still show a signed-in student the course and its labs.

    Scenario: A signed-in student reads a lab while the data API answers 503 (exercises Rules 0606, 0607)
      Given the stub student has signed in from the fixture course
      And the data API answers every call with 503
      When they open Lab 1
      Then the lab's first step is shown

    Scenario: A signed-in student reads a lab while the data API never answers (exercises Rules 0606, 0607)
      Given the stub student has signed in from the fixture course
      And the data API never answers
      When they open Lab 1
      Then the lab's first step is shown

  @rule-0616 @ears-unwanted
  Rule: If the data API does not answer, then the reader shall answer its readiness check within 3 seconds and report the data API as degraded.

    Scenario: The readiness check answers in time while the data API never answers (exercises Rule 0573)
      Given the data API never answers
      When the readiness check is asked
      Then the reader answers within 3 seconds with status "degraded"

  @rule-0617 @ears-unwanted
  Rule: If GitHub does not complete a student's sign-in, then the reader shall tell them on the sign-in page that signing in did not finish.

    Scenario: GitHub failing the sign-in leaves the student on the sign-in page with a message
      Given GitHub answers the token exchange with 503
      When the stub student signs in from the fixture course
      Then the sign-in page says signing in with GitHub did not finish
