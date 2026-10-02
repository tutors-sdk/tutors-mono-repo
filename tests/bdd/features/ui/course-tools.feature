@ui @reader
Feature: Course tools
  As a student or an author
  I want the course tree, calendar, tour, creator and presence tools to work from any page
  So that I can find my way around a course and build new ones

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0040 @ears-event-driven
  Rule: When a student follows a link in the course tree, the reader shall open that page and mark it as the only current page in the tree.

    Scenario: Course tree opens a page and marks it current
      When a student expands the course tree and follows "Mermaid Diagrams"
      Then the tree closes, the note opens, and reopening the tree marks only that link as current

  @rule-0041 @ears-ubiquitous
  Rule: The reader shall align the course tree's counts and chevrons in one column whether its branches are open or closed.

    Scenario: Course tree counts stay aligned when a branch opens
      When a student opens a branch of the course tree
      Then every count and chevron keeps the same horizontal position and is centred on its title

  @rule-0042 @ears-event-driven
  Rule: When a student filters the course calendar to assessments, the reader shall list only the weeks with assessments.

    Scenario: Calendar filters to assessment weeks
      When a student opens the course calendar and shows assessments
      Then 3 of the 16 weeks are listed

  @rule-0043 @ears-event-driven
  Rule: When a student selects "This week" in the course calendar, the reader shall list every week and move focus to the current week.

    Scenario: This week focuses the current week
      When a student selects "This week" in the course calendar
      Then all 16 weeks are listed and the current week has focus

  @rule-0044 @ears-event-driven
  Rule: When the guided tour reaches the Course Tree step, the reader shall place the tour beside the visible course tree control without covering it.

    Scenario: Tour points at the visible course tree control
      When a student starts the tour and moves to the Course Tree step
      Then the tour sits 12 pixels to the right of the visible control, inside the viewport
      And Tab keeps focus inside the tour

  @rule-0045 @ears-event-driven
  Rule: When an author completes the course creator, the reader shall download the course as a zip named after the course.

    Scenario: Course creator downloads the new course
      When an author names a course "UI test course", sets its units and generates it
      Then the preview shows course.md with the name and the download is "ui-test-course.zip"

  @rule-0046 @ears-event-driven
  Rule: When a signed-in student opens the online list from course tools, the reader shall show the online students in a dialog.

    Scenario: Online list opens as a dialog
      Given a signed-in student sees one student online
      When the student opens "View Online" from course tools
      Then a dialog lists the online student in a card narrower than 60 percent of its grid

  @rule-0239 @ears-state-driven
  Rule: While students are online in the course, the reader shall badge the "View Online" row in course tools with how many, and leave the account avatar unbadged.

    @active
    Scenario: The online row carries the count
      Given a signed-in student sees one student online
      Then "View Online" is badged "1", announces the number, and the account avatar carries no count
      And the phone navigation carries the same count and restores focus after closing the online list

    @inactive
    Scenario: With nobody online no count is drawn
      Given a signed-in student sees nobody online
      Then "View Online" is unbadged and the account avatar carries no count
      And the phone navigation offers "View Online" without a count

  @rule-0063 @ears-state-driven
  Rule: While a signed-in reader who shares presence is an educator of the course, the reader shall offer that course's class activity link in course tools.

    @inactive
    Scenario: Course tools withholds class activity from a student
      Given a signed-in student sees one student online
      Then course tools lists "My time", "Live now" and the online list, and no class activity link

    @active
    Scenario: Course tools offers class activity to an educator
      Given a signed-in educator sees one student online
      Then course tools lists a "Class activity" link to that course on the educator time dashboard

  @rule-0217 @ears-state-driven
  Rule: While a signed-in reader is an educator of the course, the reader shall offer Educator Control as the last option in the side menu's Learn section.

    @active
    Scenario: Learn section ends with Educator Control for an educator
      Given a signed-in educator is viewing a course
      Then "Educator Control" is the last option in the Learn section and opens on Content Locks
      And the Learn section also offers "Course Info"

    @inactive
    Scenario: Learn section withholds Educator Control from a student
      Given a signed-in student is viewing a course
      Then the Learn section offers "Course Info" and has no Educator Control option

  @rule-0240 @ears-ubiquitous
  Rule: The reader shall order the side menu's course sections Learn first, then Activity, then Companions.

    Scenario: Side menu runs Learn, Activity, Companions
      Given a signed-in student sees one student online
      Then the side menu's section headings read "Learn", "Activity" then "Companions"
      And the phone navigation drawer has the same section order

  @rule-0244 @ears-ubiquitous
  Rule: The reader shall order the guided tour across the header from left to right, then down the side menu from top to bottom, then through the kinds of card on the page.

    Scenario: Tour crosses the header, descends the side menu, then reaches the cards
      When a student starts the tour on the Reference Course home
      Then the steps run "Course Title", "Search", "Theme & Layout", "Your Profile", then the side menu from "Overview" down to "Companions", then "Topic Card"
      And no step is offered for a control this reader cannot see
      And on phones and tablets the tour waits for the student to open the menu before explaining its controls
      And the drawer closes when the tour reaches the cards
      And Back returns to the menu prompt without opening the drawer and Escape leaves it closed

  @rule-0242 @ears-event-driven
  Rule: When a student starts the guided tour on a page showing cards, the reader shall offer one step for each kind of card on that page, named for that kind.

    Scenario: Tour explains each kind of card on the page once
      When a student starts the tour on a topic page of talks, labs, notebooks, tutorials, notes, web links and archives
      Then the tour ends with one step for each kind, in the order the kinds first appear, and none repeated
      And whiteboard cards have a named Whiteboard Card step

  @rule-0243 @ears-event-driven
  Rule: When a visitor starts the guided tour away from any course, the reader shall tour the home page's header, its side menu and its course list.

    Scenario: Home page has a tour of its own
      When a visitor starts the tour on the home page
      Then the steps run "Tutors", "Theme & Layout", "Your Profile", the side menu from "My Courses" to "Documentation", then "Your Courses"
      And no step speaks about a course, since the visitor is not reading one
      And on phones the visitor opens the menu themselves before its controls are explained
