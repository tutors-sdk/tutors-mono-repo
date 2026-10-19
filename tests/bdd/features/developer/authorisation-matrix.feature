@developer
Feature: Authorisation matrix completeness
  As a maintainer of Tutors
  I want the authorisation matrix to list every server route the apps declare
  So that a new route cannot ship without saying who may call it and what everyone else gets

  The check is scripts/checks/authorisation.ts. It discovers every endpoint exported by a +server file and every form
  action, as tests/security/mutating-routes.txt does for writes, and compares them with
  tests/e2e-stack/authorisation/matrix.json. The E2E stack proves the statuses (Rule 0621).

  @rule-0622 @ears-ubiquitous
  Rule: Tutors shall fail the build when a server route has no entry in the authorisation matrix, when an entry names a route no file declares, or when an entry leaves a role without an expected status.

    Scenario: A route missing from the matrix fails the build
      Given a matrix without the entry for "reader GET /api/courses/[courseid]/enrollment"
      When the matrix is checked against the routes the apps declare
      Then the finding says "unlisted: reader GET /api/courses/[courseid]/enrollment"

    Scenario: A stale entry and an unanswered role fail the build
      Given a matrix with an entry for "reader DELETE /api/gone" and an entry that names only the lecturer
      When the matrix is checked against the routes the apps declare
      Then the findings say "stale: reader DELETE /api/gone" and "has no expected status for anonymous"

    Scenario: A mismatch no gap explains fails, and a gap that no longer occurs fails
      Given the committed matrix
      When the enrollment export answers 200 to a student and a listed lock gap now answers 200
      Then the findings say "unexpected: reader GET /api/courses/[courseid]/enrollment as student answered 200" and "stale gap: reader PUT /api/courses/[courseid]/locks as lecturer now answers 200"

    Scenario: The committed matrix lists every route the apps declare
      Given the committed matrix and known gaps
      Then the matrix has no findings against the routes the apps declare
      And every known gap names a matrix entry and a role
