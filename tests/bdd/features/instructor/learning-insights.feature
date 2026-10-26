@instructor
Feature: Learning insights
  As a lecturer
  I want to see where a lab is hardest and how long students wait for help
  So that I can fix the step, change the lab or come to the room sooner

  Insights are read-only numbers over the help requests and lecturer annotations stored in a
  bounded period, read through the insights views of Supabase. These Rules drive Tutors Time's
  insights service over the reader's insights API, which reads the views of a recording Supabase
  holding the rows as their migrations declare them. The reader's GET /api/insights route and a
  database without the views are in shared/insights-server.feature.

  Background:
    Given the course "cs101" with the lab "/lab/cs101/lab-01"

  @rule-0410 @ears-ubiquitous
  Rule: Tutors shall compute insights only from stored help requests and lecturer annotations through one read port, never writing.

    Scenario: Insights read the views and leave the records as they were
      Given "ellen" teaches the course
      And "alice" asked for a hint at the step "02" on "2026-01-05", answered with a hint after 3 minutes
      When "ellen" opens the course's insights for the day "2026-01-05"
      Then tutors shall have read only the insights views
      And the stored records shall be unchanged

  @rule-0411 @ears-ubiquitous
  Rule: Tutors shall compute a step diagnostic as requests by kind, acknowledged count, median and 90th percentile waiting seconds, helped answers and annotations for a step and day.

    Scenario: A step's day in numbers
      Given "ellen" teaches the course
      And these students asked for help at the step "02" on "2026-01-05"
        | learner | kind     | requested | acknowledged | closed   | reason   |
        | alice   | stuck    | 09:00:00  | 09:01:00     | 09:10:00 | resolved |
        | bob     | hint     | 09:00:00  |              | 09:02:00 | hint     |
        | carol   | lecturer | 09:00:00  | 09:05:00     | 09:20:00 | resolved |
        | dan     | stuck    | 09:30:00  |              |          |          |
        | erin    | stuck    | 09:40:00  | 09:42:00     |          |          |
      And "frank" asked for help at the step "02" on "2026-01-06", acknowledged after 30 seconds
      And "ellen" broadcast 2 explanations at the step "02" on "2026-01-05"
      When "ellen" opens the course's insights for the day "2026-01-05"
      Then the step "02" shall count 3 "stuck", 1 "hint" and 1 "lecturer" requests
      And the step "02" shall count 3 acknowledged, 1 helped by a hint and 2 annotations
      And the step "02" shall show a median wait of 120 seconds and a 90th percentile wait of 300 seconds

  @rule-0412 @ears-event-driven
  Rule: When an educator opens a course's insights, tutors shall rank its lab steps by requests and waiting time for the chosen day, week or month.

    Scenario: The step most students asked about comes first, and the week reaches further back than the day
      Given "ellen" teaches the course
      And 5 students each asked for help at the step "03" on "2026-01-05", acknowledged after 1 to 5 minutes
      And "alice" asked for help at the step "02" on "2026-01-05", acknowledged after 30 seconds
      And "frank" asked for help at the step "04" on "2026-01-01", acknowledged after 10 minutes
      When "ellen" opens the course's insights for the day "2026-01-05"
      Then the steps shall be ranked "03, 02"
      And the step "03" shall show 5 requests with a median wait of 180 seconds
      When "ellen" chooses 7 days
      Then the steps over the 7 days shall be ranked "03, 04, 02"

    Scenario: Equal requests rank the longer wait first
      Given "ellen" teaches the course
      And these students asked for help on "2026-01-05"
        | learner | step | waited |
        | alice   | 02   | 30     |
        | bob     | 05   | 300    |
        | carol   | 06   | 60     |
        | dan     | 07   | 90     |
        | erin    | 08   | 120    |
      When "ellen" opens the course's insights for the day "2026-01-05"
      Then the steps shall be ranked "05, 08, 07, 06, 02"

    Scenario: A student cannot open the course's insights
      Given "ellen" teaches the course
      And "alice" asked for help at the step "02" on "2026-01-05", acknowledged after 30 seconds
      When "alice" opens the course's insights for the day "2026-01-05"
      Then the insights page shall say "forbidden" and rank no step

  @rule-0413 @ears-ubiquitous
  Rule: Tutors shall report time to acknowledge and time to resolve as median and 90th percentile per day and per kind of help.

    Scenario: Each day and kind has its own times
      Given "ellen" teaches the course
      And 5 students each asked for help at the step "03" on "2026-01-05", acknowledged after 1 to 5 minutes
      And "frank" asked for a hint at the step "04" on "2026-01-04", answered with a hint after 4 minutes
      When "ellen" opens the course's insights for 7 days ending "2026-01-05"
      Then the response times of "2026-01-04" for "hint" shall be 1 resolved, its percentiles withheld
      And the response times of "2026-01-05" for "stuck" shall be 5 acknowledged with a median of 180 seconds and a 90th percentile of 300 seconds
      And the response times of "2026-01-05" shall have none for "hint"

  @rule-0414 @ears-ubiquitous
  Rule: Tutors shall show on a student's page their requests raised, hints read and annotations received beside the existing calendar and lab analytics.

    Scenario: A student's part in the course
      Given "ellen" teaches the course
      And "frank" asked for a hint at the step "04" on "2026-01-04", answered with a hint after 4 minutes
      And "frank" asked for help at the step "02" on "2026-01-05", acknowledged after 30 seconds
      And "ellen" wrote an annotation to "frank" at the step "05" on "2026-01-05"
      And "ellen" broadcast an explanation at each of the steps "02" and "07" on "2026-01-05"
      When "ellen" opens the student page of "frank" for 30 days ending "2026-01-05"
      Then the page shall show 2 requests raised, 1 hint read and 2 annotations received
      And the student page shall carry the help and feedback panel after the calendar and lab analytics

  @rule-0415 @ears-state-driven
  Rule: While a course has fewer than 5 students with records in the chosen period, tutors shall show counts and withhold percentiles.

    @active
    Scenario: Four students: counts only
      Given "ellen" teaches the course
      And 4 students each asked for help at the step "03" on "2026-01-05", acknowledged after 1 to 4 minutes
      When "ellen" opens the course's insights for the day "2026-01-05"
      Then the step "03" shall show 4 requests and no median or 90th percentile wait
      And the response times shall show counts and no percentiles
      And the page shall say that only counts are shown

    @inactive
    Scenario: Five students: percentiles are shown
      Given "ellen" teaches the course
      And 5 students each asked for help at the step "03" on "2026-01-05", acknowledged after 1 to 5 minutes
      When "ellen" opens the course's insights for the day "2026-01-05"
      Then the step "03" shall show 5 requests with a median wait of 180 seconds
      And the page shall not say that only counts are shown

  @rule-0418 @ears-ubiquitous
  Rule: Tutors shall name every insights view in ARCHITECTURE.md with the module that reads it.

    Scenario: The insights views are in the architecture document
      Given the architecture document
      Then it shall name "insights_help_requests" and "insights_annotations" with "@tutors/insights"

  @rule-0571 @ears-ubiquitous
  Rule: Tutors shall withhold the median and 90th percentile of a step, or of a kind of help on a day, whose requests came from fewer than 5 students, whatever the size of the course's cohort.

    Scenario: One student's step and kind show counts only beside five who asked
      Given "ellen" teaches the course
      And 5 students each asked for help at the step "03" on "2026-01-05", acknowledged after 1 to 5 minutes
      And "frank" asked for a hint at the step "04" on "2026-01-05", answered with a hint after 4 minutes
      When "ellen" opens the course's insights for the day "2026-01-05"
      Then the step "03" shall show 5 requests with a median wait of 180 seconds
      And the step "04" shall show 1 requests and no median or 90th percentile wait
      And the response times of "2026-01-05" for "hint" shall be 1 resolved, its percentiles withheld
      And the page shall not say that only counts are shown
