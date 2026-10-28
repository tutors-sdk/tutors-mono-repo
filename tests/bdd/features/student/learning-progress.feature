@student
Feature: Learning Progress Tracking
  As a student
  I want to track my learning progress through courses
  So that I can monitor my engagement and identify areas needing attention

  Background:
    Given the course "web-dev-101" is published with 2 labs
    And the student "Alice" is signed in

  @rule-0544 @ears-event-driven
  Rule: When a lecturer loads the time report of a course, the time dashboard shall show each student's total time active in hours and minutes.

    Scenario: View time spent on a course
      Given the calendar holds 150 thirty-second blocks of time active for "alice" on "2026-03-16" and 30 on "2026-03-17"
      When the time report for the course is loaded
      Then the system shall display 90 minutes of total time active for "alice"
      And time shall be displayed in hours and minutes as "1h 30"

  @rule-0545 @ears-event-driven
  Rule: When a signed-in student views a learning object, the reader shall count the page load and record each 30 seconds of activity against the learning object and the day's calendar.

    Scenario: Record learning activity
      When the student views lab 1 of the course 2 times
      And the student stays on that page for 60 seconds
      Then the system shall record 2 more blocks of time active against the lab and against the calendar for today
      And the system shall increment the page load count for the lab to 2

  @rule-0546 @ears-event-driven
  Rule: When the dashboard of a signed-in student loads, the reader shall list the courses the student accessed recently with the date of each last visit.

    Scenario: Resume from last accessed position
      Given the student has previously accessed the course
      When the dashboard loads the recently accessed courses of the student
      Then the system shall list "web-dev-101" among the recently accessed courses
      And the entry shall show today as the last accessed date

  @rule-0547 @ears-event-driven
  Rule: When a student stars a course, the reader shall store the course among the favourites in the student's profile.

    Scenario: Star a favourite course
      Given the student has previously accessed the course
      When the student stars the course "web-dev-101"
      Then the system shall store "web-dev-101" as a favourite in the profile of the student
      And the home page shall load "web-dev-101" among the favourites of the student

  @rule-0548 @ears-event-driven
  Rule: When a signed-in student views learning objects in more than one course, the reader shall count page loads per learning object, grouped by course.

    Scenario: View learning records per learning object
      Given the course "databases-101" is also published
      When the student views lab 1 of "web-dev-101" 3 times, lab 2 of "web-dev-101" 1 time and lab 1 of "databases-101" 2 times
      Then the system shall track page loads per learning object:
        | course        | lab | page loads |
        | web-dev-101   | 1   | 3          |
        | web-dev-101   | 2   | 1          |
        | databases-101 | 1   | 2          |
      And the records shall be grouped by course, 2 for "web-dev-101" and 1 for "databases-101"

  @rule-0272 @ears-event-driven
  Rule: When a student opens a learning object, the reader shall report one learning event for it.

    Scenario: Page data settling does not report the view again
      When the student views lab 1 of the course 1 times
      And the course, the learning object and the identity of the student settle
      Then the system shall increment the page load count for the lab to 1
      And the reader shall have reported 1 learning event for "Alice"

    Scenario: A change of mood on the same page is still reported
      When the student views lab 1 of the course 1 times
      And the student changes their sentiment to "confused"
      Then the reader shall have reported 2 learning events for "Alice"
      And the last reported event shall carry the sentiment "confused"

  @rule-0283 @ears-event-driven
  Rule: When a student moves to another learning object, the reader shall report one learning event, for the learning object they arrive at.

    Scenario: The learning object loading before the address changes is not reported as a page
      When the student views lab 1 of the course 1 times
      And the student moves to lab 2, which loads before the address changes
      Then the system shall count 1 page load for lab 1 and 1 for lab 2
      And the reader shall have reported 2 learning events for "Alice"

    Scenario: A jump within the same page is not a new page load
      When the student views lab 1 of the course 1 times
      And the student jumps to a heading on the same page
      Then the system shall increment the page load count for the lab to 1
      And the reader shall have reported 1 learning event for "Alice"

    Scenario: A move the student cancels does not hold back later reports
      When the student views lab 1 of the course 1 times
      And the student starts to move to lab 2 but cancels
      And the student changes their sentiment to "confused"
      Then the reader shall have reported 2 learning events for "Alice"

  @rule-0303 @ears-event-driven
  Rule: When a student opens a learning object, the reader shall record the page view against the learning object and the day's calendar in one database request.

    Scenario: A page view is one request
      When the student views lab 1 of the course 2 times
      Then the reader shall have made 2 page-view requests and no other learning record or calendar requests
      And the system shall increment the page load count for the lab to 2

  @rule-0304 @ears-state-driven
  Rule: While a course page is visible, the reader shall record each 30 seconds of activity in one database request.

    @active
    Scenario: Time on a visible page is one request per 30 seconds
      When the student views lab 1 of the course 1 times
      And the student stays on that page for 60 seconds
      Then the reader shall have made 2 activity requests and no other learning record or calendar requests
      And the system shall record 2 more blocks of time active against the lab and against the calendar for today

    @inactive
    Scenario: Time on a hidden page is not recorded
      When the student views lab 1 of the course 1 times
      And the page is hidden
      And the student stays on that page for 60 seconds
      Then the reader shall have made 0 activity requests and no other learning record or calendar requests
      And the system shall record 0 more blocks of time active against the lab and against the calendar for today

  @rule-0649 @ears-event-driven
  Rule: When a student opens the course pages again in the same tab, the reader shall record each 30 seconds of activity in one database request.

    Scenario: Opening the course pages twice records one heartbeat per 30 seconds
      When the student views lab 1 of the course 1 times
      And the course pages open
      And the course pages open again
      And the student spends 60 seconds on the course pages
      Then the reader shall have made 2 activity requests and no other learning record or calendar requests

    Scenario: Returning to the course pages twice records one heartbeat per 30 seconds
      When the student views lab 1 of the course 1 times
      And the course pages open
      And the course pages close
      And the course pages open again
      And the course pages open once more
      And the student spends 60 seconds on the course pages
      Then the reader shall have made 2 activity requests and no other learning record or calendar requests

  @rule-0650 @ears-event-driven
  Rule: When a student leaves the course pages, the reader shall stop recording activity for that tab.

    Scenario: No heartbeat follows leaving the course pages
      When the student views lab 1 of the course 1 times
      And the course pages open
      And the course pages open again
      And the course pages close
      And the student spends 60 seconds on the course pages
      Then the reader shall have made 0 activity requests and no other learning record or calendar requests

    Scenario: Leaving twice is harmless and the next visit records again
      When the student views lab 1 of the course 1 times
      And the course pages open
      And the course pages open again
      And the course pages close
      And the course pages close again
      And the course pages open once more
      And the student spends 30 seconds on the course pages
      Then the reader shall have made 1 activity requests and no other learning record or calendar requests

  @rule-0305 @ears-unwanted
  Rule: If the database lacks the single-request recording functions, then the reader shall record page views and activity with the per-table requests.

    Scenario: Recording falls back before the migration is applied
      Given the database lacks the single-request recording functions
      When the student views lab 1 of the course 2 times
      And the student stays on that page for 60 seconds
      Then the system shall record 2 more blocks of time active against the lab and against the calendar for today
      And the system shall increment the page load count for the lab to 2
      And the reader shall have asked for a recording function once

  @rule-0319 @ears-event-driven
  Rule: When a lecturer loads a course's time report for a date range, the time dashboard shall read only that course's calendar days within the range from the database.

    Scenario: A date range is read, not the whole calendar
      Given the calendar holds 10 thirty-second blocks of time active for "alice" on each of "2026-03-01, 2026-03-16, 2026-03-17, 2026-04-01"
      When the time report for the course is loaded from "2026-03-16" to "2026-03-17"
      Then the database shall have returned 2 calendar days for the course
      And the report shall cover the days "2026-03-16, 2026-03-17"

    Scenario: A report with no range still reads the whole course
      Given the calendar holds 10 thirty-second blocks of time active for "alice" on each of "2026-03-01, 2026-03-16, 2026-03-17, 2026-04-01"
      When the time report for the course is loaded with no date range
      Then the database shall have returned 4 calendar days for the course
      And the report shall cover the days "2026-03-01, 2026-03-16, 2026-03-17, 2026-04-01"
