Feature: Student data goes through the reader's server
  As a student
  I want only the reader's server, acting for my signed-in session, to read and change my data
  So that nobody holding the public anon key can download or rewrite it

  Background:
    Given the course "web-dev-101" is published with 2 labs and "eve" as its educator

  @rule-0071 @ears-unwanted
  Rule: If a request to record, read or change a student's data reaches the reader without a signed-in session, then the reader shall answer 401 and read or write no row.

    Scenario: An anonymous page load is refused
      Given nobody is signed in to the reader
      When the browser posts a page load of the first lab of "web-dev-101" naming the student "alice"
      Then the reader answers 401
      And no row is read from or written to the database

    Scenario: An anonymous request for a course's time data is refused
      Given "alice", "bob" and "carol" have learning records and calendar rows in "web-dev-101"
      And nobody is signed in to the reader
      When the browser asks the reader for the time data of "web-dev-101"
      Then the reader answers 401
      And no row is read from or written to the database

  @rule-0072 @ears-ubiquitous
  Rule: The reader shall store a signed-in student's learning records, calendar, sentiment, online status and shared presence under the GitHub login of the session, whatever student id the request names.

    Scenario: A request naming another student is stored under the session's login
      Given "Alice" is signed in to the reader
      When the browser posts a page load of the first lab of "web-dev-101" naming the student "bob"
      And the browser sets the sentiment "confident" and the online status "offline" naming the student "bob"
      And the browser shares presence on the first lab of "web-dev-101" naming the student "bob"
      Then the learning record, calendar row and presence row are stored under "alice"
      And the user row of "alice" has the sentiment "confident" and the online status "offline"
      And nothing is stored under "bob"

    Scenario: A signed-in student's lab visit reaches the database only through the reader's server
      Given "Alice" is signed in to the reader
      When "Alice" opens the first lab of "web-dev-101"
      Then the learning record and calendar row are stored under "alice"
      And no row was written with the browser's anon key

  @rule-0065 @ears-unwanted
  Rule: If a signed-in user who is not an educator of a course asks the reader to lock or unlock its content, then the reader shall answer 403 and leave the course's locks unchanged.

    Scenario: A student cannot lock a course's content
      Given "Alice" is signed in to the reader
      When the browser asks the reader to lock the first lab of "web-dev-101"
      Then the reader answers 403
      And "web-dev-101" has no content locks

    Scenario: The course's educator can lock its content
      Given "Eve" is signed in to the reader
      When the browser asks the reader to lock the first lab of "web-dev-101"
      Then the reader answers 204
      And the first lab of "web-dev-101" is locked by "eve"

  @rule-0066 @ears-state-driven
  Rule: While a signed-in viewer is not an educator of a course, the reader shall return the course's time data with every other student's id replaced by a pseudonym and without any other student's name, avatar, sentiment or online status.

    @active
    Scenario: A student sees their own time and anonymous classmates
      Given "alice", "bob" and "carol" have learning records and calendar rows in "web-dev-101"
      And "Carol" is signed in to the reader
      When the browser asks the reader for the time data of "web-dev-101"
      Then the reader answers 200
      And the time data holds the rows of "carol" under "carol"
      And the time data holds the other students' rows under "student-1" and "student-2"
      And the time data names no student other than "carol"

    @inactive
    Scenario: The course's educator sees every student by name
      Given "alice", "bob" and "carol" have learning records and calendar rows in "web-dev-101"
      And "Eve" is signed in to the reader
      When the browser asks the reader for the time data of "web-dev-101"
      Then the reader answers 200
      And the time data holds the rows of "alice", "bob" and "carol" with their names and avatars

  @rule-0067 @ears-event-driven
  Rule: When a viewer opens a course in the time dashboard, the time dashboard shall load the course's time data from the reader's API with the viewer's reader session instead of from the database.

    Scenario: A lecturer opens a course in the time dashboard
      Given "alice" and "bob" have learning records and calendar rows in "web-dev-101"
      And "Eve" is signed in to the reader
      When "Eve" opens "web-dev-101" in the time dashboard
      Then the time dashboard asked the reader for "/api/time/web-dev-101" with the viewer's reader session
      And the time dashboard's calendar lists "Alice" and "Bob"
      And the time dashboard read nothing from the database directly

  @rule-0068 @ears-state-driven
  Rule: While a student is signed in, the reader shall save the student's edits to a whiteboard learning object in a room that only that student's session can read or overwrite.

    @active
    Scenario: Each signed-in student's whiteboard edits are saved in their own room
      Given "Alice" is signed in to the reader
      And "Alice" has saved a drawing on the whiteboard of the first lab of "web-dev-101"
      When "Bob" is signed in to the reader
      And "Bob" saves a drawing on the whiteboard of the first lab of "web-dev-101"
      Then the whiteboard of the first lab holds the drawing of "Alice" for "alice" and the drawing of "Bob" for "bob"
      And the reader gives "Bob" back only the drawing of "Bob"
      And a public shared route cannot read "Alice"'s personal drawing
      And the database gives the anon key no policy on whiteboard_scenes

    @inactive
    Scenario: An anonymous visitor's whiteboard edits are not saved
      Given nobody is signed in to the reader
      When the browser saves a drawing on the whiteboard of the first lab of "web-dev-101"
      Then the reader answers 401
      And no whiteboard scene is stored

  @rule-0069 @ears-ubiquitous
  Rule: Tutors shall give the anon key no read access to the rows of app_errors.

    Scenario: A browser can report an error but cannot read the error log
      When the database is built from supabase/migrations in order
      Then a policy lets the anon key insert into app_errors
      And no policy lets the anon key read app_errors
      And the error counts the health checks read run as the function's owner and return only app, level and count

  @rule-0070 @ears-event-driven
  Rule: When a visitor opens the catalogue, the catalogue shall show the number of students without reading any student's profile.

    Scenario: The student count comes from a count, not from the profiles
      Given 3 students have course-visit profiles
      When a visitor opens the catalogue
      Then the catalogue shows 3 students
      And no student's profile was read
