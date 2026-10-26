@shared
Feature: Learning insights on the reader's server
  As a lecturer reading a course's insights in Tutors Time
  I want them computed on the reader's server from the stored help requests and feedback
  So that only the course's educators read them and a missing database view breaks nothing else

  Insights are read from two Supabase views of the help request and feedback tables
  (insights_help_requests, insights_annotations) that carry no free text, by the reader's
  GET /api/insights with the service-role key, for an educator of the course. Tutors Time asks
  from its own origin with the reader's session. These Rules drive that route over a recording
  Supabase holding the rows as their migrations declare them.

  Background:
    Given the course "cs101" is published with 1 lab and "ellen" as its educator
    And the reader's server keeps help requests and feedback in Supabase with the service role key

  @rule-0416 @ears-unwanted
  Rule: If the insights views are missing in the database, then tutors shall show the insights pages empty with one message and keep the rest of Time working.

    Scenario: A database without the insights views
      Given 5 students asked for help at the step "03" of the first lab on "2026-01-05"
      And the database has no insights views
      When "ellen" reads the insights of "cs101" for the day "2026-01-05" from Tutors Time
      Then the reader shall answer 503 with the reason "not-ready"
      And the insights page shall show the one message for "not-ready"
      And the reader shall still answer the course's help queue to "ellen"

  @rule-0417 @ears-ubiquitous
  Rule: Tutors shall read insights with date-filtered, indexed queries bounded to the chosen period, as Rule 0319 requires of the calendar.

    Scenario: Every insights read names the course and the period, over an index that leads with them
      Given 5 students asked for help at the step "03" of the first lab on "2026-01-05"
      And "ellen" has broadcast an explanation on the step "03" of the first lab on "2026-01-05"
      When "ellen" reads the insights of "cs101" for 7 days ending "2026-01-05" from Tutors Time
      Then the reader shall answer 200 with the step "03" first
      And every insights query shall filter on the course and on the period from "2025-12-30T00:00:00.000Z" to "2026-01-06T00:00:00.000Z"
      And each view's table shall have an index on the course and the time it filters on
      And no insights answer shall carry a hint, an annotation's body or a student's name

    Scenario: A student is refused before any row is read
      Given 5 students asked for help at the step "03" of the first lab on "2026-01-05"
      When "alice" reads the insights of "cs101" for the day "2026-01-05" from Tutors Time
      Then the reader shall answer 403 with the reason "forbidden"
      And no insights query shall have been made

    Scenario: Another origin is refused
      Given 5 students asked for help at the step "03" of the first lab on "2026-01-05"
      When "ellen" reads the insights of "cs101" for the day "2026-01-05" from "https://elsewhere.invalid"
      Then the reader shall answer 403 with the reason "forbidden"
      And no insights query shall have been made
