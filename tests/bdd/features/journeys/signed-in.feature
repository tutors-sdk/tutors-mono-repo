@journey @reader @live @time
Feature: Signed-in journeys across the built apps
  As a student or a lecturer
  I want what I do signed in to work from end to end in the apps we ship
  So that a change that breaks sign-in, a write or a second person's view fails the nightly run, not the next release

  Each scenario is proved by the Playwright journey with the same title, tagged with the Rule id, in
  tests/e2e-stack/journeys/signed-in.journey.spec.ts. The journeys run against the built images of the
  E2E stack (tests/e2e-stack/compose.yaml) with the release harness's identity stub (GitHub sign-in) and
  persistence stub (the data API and Realtime), so they need no GitHub, Supabase or Netlify, and can
  read back what the apps wrote. They are the release harness's Rule journeys (its Rules 0582-0592),
  run every night instead of after a release candidate is built.

  @rule-0606 @ears-event-driven
  Rule: When a student signs in from a course, the reader shall return them to that course signed in and record their visit to it.

    Scenario: A student signs in and is returned to the course (exercises Rules 0011, 0250, 0260)
      Given the fixture course is public
      When the stub student signs in from the course
      Then the course page shows and offers the student's profile menu
      And the data API has recorded the student, the course and a page view

  @rule-0607 @ears-event-driven
  Rule: When a signed-in student moves between the steps of a lab, the reader shall record a page view for each step they open.

    Scenario: A signed-in student moves through a lab and each step is recorded (exercises Rules 0303, 0330)
      Given the stub student has signed in from the fixture course
      When they open Lab 1 and move to its second step
      Then each step is shown
      And the data API has recorded one page view for each step

  @rule-0608 @ears-unwanted
  Rule: If a signed-in student opens a private course that does not list them, then the reader shall send them to My courses.

    Scenario: A student the private course does not list is turned away (exercises Rules 0011, 0267)
      Given the signed-in course is private and lists only the enrolled student
      When the stub student signs in from that course
      Then the reader shows My courses, not the course
      And typing the course's address sends them to My courses again

  @rule-0609 @ears-event-driven
  Rule: When a signed-in student chooses an appearance and a theme, the reader shall keep both after the page reloads.

    Scenario: A student's appearance and theme survive a reload (exercises Rules 0037, 0038, 0039)
      Given the enrolled student has signed in from the signed-in course
      When they choose the dark appearance and the Dyslexia theme
      And they reload the page
      Then the Preferences menu still shows Dark and Dyslexia

  @rule-0610 @ears-event-driven
  Rule: When an enrolled student submits a quiz, the reader shall show how many of their answers were correct.

    Scenario: An enrolled student submits a quiz and sees their score (exercises Rules 0047, 0050)
      Given the enrolled student has signed in from the signed-in course
      When they answer both questions of Quiz 1 and submit it
      Then the reader says they answered 2 of 2 questions correctly

  @rule-0611 @ears-event-driven
  Rule: When a lecturer locks a topic of a course, the reader shall leave that topic out of the course page an enrolled student sees.

    Scenario: A lecturer locks a topic and the enrolled student no longer sees it (exercises Rules 0052, 0053, 0630)
      Given the lecturer has signed in from the signed-in course
      When they lock Topic 2 from Educator Control
      And the reader saved the lock through its educator check
      And the enrolled student signs in from the course in their own browser
      Then the student's course page shows Topic 1 and not Topic 2

  @rule-0612 @ears-event-driven
  Rule: When a student who shares presence opens a lab, the live dashboard shall list that student among the students online in the course.

    Scenario: A student who shares presence appears in Tutors Live (exercises Rules 0330, 0335)
      Given the data API relays Realtime broadcasts
      And the stub student has signed in from the fixture course
      When they open Lab 1
      And a lecturer opens Tutors Live
      Then Live lists one course and the student under Students

  @rule-0613 @ears-event-driven
  Rule: When a lecturer enters a course's PIN, the time dashboard shall show the medians of the time the course's students have recorded.

    Scenario: A lecturer opens the time dashboard's medians with the course PIN (exercises Rule 0319)
      Given the data API holds two students' recorded days for the signed-in course
      When the lecturer opens the time dashboard's medians and enters the course PIN
      Then the dashboard shows the medians row computed from those days

  @rule-0635 @ears-event-driven
  Rule: When a student who shares presence picks a course sentiment, the reader shall show that sentiment in the profile menu and list the student in the course's online list.

    Scenario: A student who shares presence picks a sentiment and sees themself online (exercises Rules 0046, 0064, 0280)
      Given the stub student has signed in from the fixture course
      When they open the profile menu and pick the sentiment "confident"
      Then the profile menu shows their sentiment as confident
      And the course's online list shows them

  @rule-0636 @ears-event-driven
  Rule: When an enrolled student moves forward through a talk and a notebook, the reader shall show the slide and the cell they moved to.

    Scenario: An enrolled student moves forward a slide of a talk and a cell of a notebook (exercises Rules 0047, 0049)
      Given the enrolled student has signed in from the signed-in course
      When they open Talk 1 and move forward one slide
      Then the talk shows slide 2 of 4
      When they open Notebook 1 and move to the next cell
      Then the notebook shows cell 2 of 2

  @rule-0637 @ears-event-driven
  Rule: When a student filters a course calendar to assessments, the reader shall show only the calendar's assessment weeks.

    Scenario: A student filters the calendar to assessments and finds the course for LLMs (exercises Rules 0042, 0284)
      Given the enrolled student has signed in from the signed-in course
      When they open the course calendar and show only assessments
      Then the calendar lists the assignment week and no others
      When they follow the link to the version of the course for LLMs
      Then the page links the course's complete text for LLMs

  @rule-0638 @ears-event-driven
  Rule: When a lecturer opens the time dashboard's lab views with the course PIN, the time dashboard shall list the students who have recorded time on the course's labs.

    Scenario: A lecturer opens the time dashboard's lab views and a student's page (exercises Rule 0319)
      Given the data API holds three students' lab records for the signed-in course
      When the lecturer opens the labs by lab with the course PIN
      Then the labs by lab, labs by step and learning records list the students
      And the least engaged student's page is headed with their name

  @rule-0639 @ears-event-driven
  Rule: When a student alone on a whiteboard draws a stroke in Edit mode, the reader shall save the drawing and say that it saved.

    Scenario: One stroke drawn alone on a whiteboard is saved (exercises Rules 0275, 0276)
      Given the enrolled student has signed in from the signed-in course
      When they open Whiteboard 1 in Edit mode and draw one stroke
      Then the whiteboard says the drawing changes are saved
      And the data API recorded one write of the whiteboard's scene

  @rule-0640 @ears-event-driven
  Rule: When a lecturer syncs a Moodle course from Educator Control, the reader shall say the assignments synced once the data API holds the assignments and submissions.

    Scenario: A lecturer syncs Moodle from Educator Control (exercises Rules 0633, 0634)
      Given the lecturer has signed in from the signed-in course
      When they enter Moodle course 1234 in Educator Control and press Sync Moodle
      Then Educator Control says the Moodle assignments synced
      And the data API recorded writes of the assignments and their submissions
