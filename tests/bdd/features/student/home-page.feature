@student
Feature: Student home page
  As a student
  I want the home page to show how far I have got in each course, take me back to where I stopped
  and keep the learning objects I bookmarked
  So that I can pick up where I left off

  The learning objects a course publishes are the pages the reader opens for it: every learning
  object in its tutors.json except topics, units, sides, lab steps, the panels shown on a topic's
  page, and links out (web, github and archive). A learning record counts toward the learning
  object whose route it equals or sits beneath, so a lab step's record counts toward its lab.
  Progression measures learning objects opened, not mastered. Only those learning objects can be
  bookmarked, and a bookmark keeps the title the course publishes for it.

  Background:
    Given the course "web-dev-101" is published with 4 labs

  @rule-0076 @ears-event-driven
  Rule: When a signed-in student selects Continue on a course on the home page, the reader shall open the learning object the student last opened in that course.

    Scenario: Continue leads to the last lab opened
      Given "alice" is signed in
      And "alice" last opened lab 3 of "web-dev-101", after lab 1
      When the home page loads the progress of "alice"
      Then Continue on "web-dev-101" leads to lab 3 of "web-dev-101"

    Scenario: Continue leads to the lab step last opened
      Given "alice" is signed in
      And "alice" last opened the first step of lab 2 of "web-dev-101"
      When the home page loads the progress of "alice"
      Then Continue on "web-dev-101" leads to the first step of lab 2 of "web-dev-101"

  @rule-0077 @ears-state-driven
  Rule: While a signed-in student has learning records for a course, the reader shall show on the home page the number of that course's learning objects the student has opened out of the number the course publishes.

    @active
    Scenario: Progression counts the labs opened
      Given "alice" is signed in
      And "alice" has learning records for labs 1 and 2 of "web-dev-101" and for the first step of lab 2
      When the home page loads the progress of "alice"
      Then "web-dev-101" shows 2 of 4 learning objects opened

    @inactive
    Scenario: No learning records, nothing opened
      Given "alice" is signed in
      And "alice" has no learning records for "web-dev-101"
      When the home page loads the progress of "alice"
      Then "web-dev-101" shows 0 of 4 learning objects opened and no Continue

  @rule-0078 @ears-state-driven
  Rule: While no one is signed in, the reader shall show on the home page the courses stored in the browser without progression or bookmarks.

    @active
    Scenario: A visitor who is not signed in sees no progression
      Given nobody is signed in and the browser has visited "web-dev-101"
      When the home page loads
      Then "web-dev-101" is listed without progression or bookmarks
      And the reader asks the data API for nothing

    @inactive
    Scenario: A signed-in student sees progression
      Given "alice" is signed in
      And "alice" has learning records for labs 1 and 2 of "web-dev-101" and for the first step of lab 2
      When the home page loads the progress of "alice"
      Then "web-dev-101" shows 2 of 4 learning objects opened

  @rule-0079 @ears-unwanted
  Rule: If the reader's data API does not answer while a signed-in student's home page loads, then the reader shall show progression and bookmarks as unavailable instead of as empty.

    Scenario: The data API is down
      Given "alice" is signed in
      And the reader's data API is down
      When the home page loads the progress of "alice"
      Then progression and bookmarks are shown as unavailable

    Scenario: The course host is down
      Given "alice" is signed in
      And "alice" has opened "databases-101", whose host is down and has never been read
      When the home page loads the progress of "alice"
      Then "databases-101" shows its progression as unavailable

  @rule-0150 @ears-event-driven
  Rule: When a signed-in student bookmarks a learning object, the reader shall list that learning object under bookmarks on the student's home page.

    Scenario: A bookmarked lab is listed on the home page
      Given "alice" is signed in
      When "alice" bookmarks lab 2 of "web-dev-101"
      And the home page loads the progress of "alice"
      Then the bookmarks list lab 2 of "web-dev-101" with the title the course gives it

    Scenario: A lab step is bookmarked under its lab's title
      Given "alice" is signed in
      When "alice" bookmarks the first step of lab 3 of "web-dev-101"
      And the home page loads the progress of "alice"
      Then the bookmarks list the first step of lab 3 of "web-dev-101" titled as lab 3

  @rule-0151 @ears-event-driven
  Rule: When a signed-in student removes a bookmark, the reader shall remove it from the student's home page in every session of that student.

    Scenario: A removed bookmark is gone in a new session
      Given "alice" is signed in
      And "alice" has bookmarked labs 1 and 2 of "web-dev-101"
      When "alice" removes the bookmark on lab 1 of "web-dev-101"
      And "alice" signs in again in another browser and the home page loads
      Then the bookmarks list only lab 2 of "web-dev-101"

  @rule-0152 @ears-ubiquitous
  Rule: The reader shall store a bookmark under the GitHub login of the session with the title the course publishes, whatever student or title the request names.

    Scenario: A bookmark request naming another student and title
      Given "alice" is signed in
      When the browser asks to bookmark lab 1 of "web-dev-101" naming the student "bob" and the title "Free marks"
      Then "alice" has a bookmark on lab 1 of "web-dev-101" with the title the course gives it
      And "bob" has no bookmarks

  @rule-0153 @ears-unwanted
  Rule: If a request to bookmark names a learning object the course does not publish, then the reader shall answer 404 and store no bookmark.

    Scenario: Bookmarking a route the course does not publish
      Given "alice" is signed in
      When the browser asks to bookmark the route "/lab/web-dev-101/topic-1/no-such-lab" of "web-dev-101"
      Then the reader answers 404
      And "alice" has no bookmarks

    Scenario: Bookmarking a course that is not published
      Given "alice" is signed in
      When the browser asks to bookmark the route "/lab/ghost-course/topic-1/lab-1" of "ghost-course"
      Then the reader answers 404
      And "alice" has no bookmarks
