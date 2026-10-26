@journey @reader @live @time
Feature: Authorisation matrix
  As a maintainer of Tutors
  I want every server route asked as every kind of caller, against the built images
  So that a route that hands a student what only a lecturer or an operator may have fails the nightly run

  The matrix is tests/e2e-stack/authorisation/matrix.json: for each endpoint a route file declares, the request to
  send and the status anonymous, student, enrolled, lecturer and operator callers get. Cells that answer something
  else today are listed, with the reason, in tests/e2e-stack/authorisation/known-gaps.txt, which may only shrink.
  The scenario is proved by the Playwright journey with the same title, tagged with the Rule id, in
  tests/e2e-stack/journeys/authorisation.journey.spec.ts. The roles sign in through the identity stub; the operator
  presents the stack's metrics token. Rule 0622 (developer/authorisation-matrix.feature) keeps the matrix complete.

  @rule-0621 @ears-ubiquitous
  Rule: Tutors shall answer every server route, for each of an anonymous caller, a signed-in student, an enrolled student, a course educator and a metrics operator, with the status the authorisation matrix commits to, except for the cells its known gaps list.

    Scenario: Every server route answers each role with the status the matrix commits to
      Given the authorisation matrix and its known gaps
      When each route in the matrix is asked as each role against the built images
      Then every answer is the matrix's status or a listed gap
      And no listed gap answers differently from what it records
