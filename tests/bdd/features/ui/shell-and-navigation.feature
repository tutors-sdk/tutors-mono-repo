@ui @reader
Feature: Reader shell and navigation
  As a student
  I want the reader's header, sidebar and dialogs to take me where I expect
  So that I can find and follow course content on any screen

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0019 @ears-ubiquitous
  Rule: The reader shall lay out every page without horizontal scrolling at viewport widths from 320 to 1440 pixels.

    Scenario: Lab pages fit every viewport width
      Given a student is reading a lab step
      When the viewport is 320, 390, 768, 1024 and 1440 pixels wide in turn
      Then neither the page nor the main content scrolls sideways

  @rule-0020 @ears-event-driven
  Rule: When a visitor opens the home page, the reader shall show the Tutors introduction above the course list.

    Scenario: Home page introduces Tutors above the courses
      When a visitor opens the home page
      Then the page is titled Tutors
      And the introduction region with its heading and Create link sits above "Welcome to Tutors"

  @rule-0021 @ears-event-driven
  Rule: When a student opens a course, the reader shall show the course title, its topic count in the author's order and a link to the first topic.

    Scenario: Course home leads to the first topic
      When a student opens the Reference Course
      Then the heading "Reference Course" and "9 · Author's order" are shown
      And following the first topic card and then the first lab card opens the lab's first step

  @rule-0022 @ears-event-driven
  Rule: When a student opens a course that has a parent course, the reader shall show the parent course's title in the breadcrumb trail.

    Scenario: Breadcrumbs name the parent course
      When a student opens the Reference Course
      Then the breadcrumb trail reads "My courses", "Tutors Reference Manual", "Reference Course"

  @rule-0023 @ears-event-driven
  Rule: When a student searches a course, the reader shall list each matching resource once as a card.

    Scenario: Search lists each matching resource once
      When a student searches the Reference Course for "lab"
      Then the address holds the query
      And the results are resource cards with no link repeated

  @rule-0055 @ears-event-driven
  Rule: When a student opens search from the header or with Ctrl+K, the reader shall show a search dialog that lists matching resources as the student types and opens the one the student chooses.

    Scenario: Search dialog finds and opens a resource
      When a student selects Search in the header
      Then a search dialog opens listing the course's topics
      When the student types "lab", moves down a result and presses Enter
      Then the dialog closes and the chosen resource opens

    Scenario: Keyboard shortcut opens search
      When a student presses Ctrl+K on a course page
      Then the search dialog opens with the search box focused
      And Escape closes it

  @rule-0024 @ears-state-driven
  Rule: While the viewport is narrower than 768 pixels, the reader shall open the course tree and course navigation from buttons in the header.

    @active
    Scenario: Phone header opens the course tree and navigation
      Given the viewport is 320, 390 or 768 pixels wide
      When the student uses the header's "Course Tree" and "Course navigation" buttons
      Then each opens one dialog, and closing it returns focus to its button

    @inactive
    Scenario: Desktop header shows course info and the sidebar holds the tools
      Given the viewport is 1440 pixels wide
      Then the header offers "Open course info" and the sidebar offers "Edit this course"

  @rule-0025 @ears-event-driven
  Rule: When a student closes a menu or dialog, the reader shall return focus to the control that opened it.

    Scenario: Closing the preferences menu returns focus to its button
      When a student opens Preferences and presses Escape
      Then focus is on the "Open Theme Menu" button

    Scenario: Closing the online dialog returns focus to its course tools row
      Given a signed-in student sees one student online
      When the student opens "View 1 Online" from course tools and closes it
      Then focus is on the "View 1 Online" row of course tools

  @rule-0026 @ears-event-driven
  Rule: When an anonymous visitor opens the account menu, the reader shall offer a link to the home page.

    Scenario: Anonymous account menu links home
      When an anonymous visitor opens the account menu and follows "My courses"
      Then the home page opens

  @rule-0064 @ears-event-driven
  Rule: When a signed-in reader who shares presence opens the account menu, the reader shall offer the sentiment picker in that menu and nowhere in course tools.

    Scenario: Account menu holds the sentiment picker
      Given a signed-in student sees one student online
      When the student opens the account menu and picks a sentiment
      Then the picker sat in the account menu, not in course tools, and the menu shows the chosen sentiment

  @rule-0027 @ears-ubiquitous
  Rule: The reader shall draw the header's search and preferences controls with the same font size, weight, colour, padding and height.

    Scenario: Header controls share one style
      When a student opens a course
      Then the search and preferences controls have matching computed styles

  @rule-0028 @ears-unwanted
  Rule: If a student opens a course that does not exist, then the reader shall show a Page Not Found message with a link home.

    Scenario: Unknown course shows Page Not Found
      When a student opens "/course/nonexistent-course-id-12345"
      Then the page shows "404", "Page Not Found" and a "Go Home" link

  @rule-0062 @ears-state-driven
  Rule: While the viewport is narrower than 768 pixels, the reader shall slide the header out of view as a student scrolls down a page and back into view as the student scrolls up.

    @active
    Scenario: Phone header hides on scroll down and returns on scroll up
      Given the viewport is 390 pixels wide
      When a student scrolls down the course home
      Then the header is out of view
      And when the student scrolls up a little the header is back in view

    @inactive
    Scenario: Desktop header stays while scrolling
      Given the viewport is 1440 pixels wide
      When a student scrolls down the course home
      Then the header stays in view
