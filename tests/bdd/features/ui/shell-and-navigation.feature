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
  Rule: When a student opens a course, the reader shall show the course title, topics in the author's order and a link to the first topic.

    Scenario: Course home leads to the first topic
      When a student opens the Reference Course
      Then the headings "Reference Course" and "Course topics" are shown without a topic count
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
      When the student uses the header's icon-only "Open course tree" and "Course navigation" buttons
      Then each opens one dialog, and closing it returns focus to its button
      And the title and controls share one toolbar

    @inactive
    Scenario: Desktop sidebar holds course info and the tools
      Given the viewport is 1440 pixels wide
      Then the sidebar offers "Open course info" and "Edit this course", and the header offers neither

  @rule-0025 @ears-event-driven
  Rule: When a student closes a menu or dialog, the reader shall return focus to the control that opened it.

    Scenario: Closing the preferences menu returns focus to its button
      When a student opens Preferences and presses Escape
      Then focus is on the "Open Theme Menu" button

    Scenario: Closing the online dialog returns focus to its course tools row
      Given a signed-in student sees one student online
      When the student opens "View Online" from course tools and closes it
      Then focus is on the "View Online" row of course tools

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

  @rule-0241 @ears-ubiquitous
  Rule: The reader shall place the site footer at the bottom of the viewport when content fits, and after the content in the same scroll area when content exceeds the viewport.

    Scenario: Footer fills short pages and follows long content
      Given a student opens Docs for LLMs for the Tutors Reference Manual
      When the viewport is 320, 768 and 1440 pixels wide in turn
      Then the footer reaches the viewport bottom in a window 2000 pixels tall without scrolling
      And in a window 400 pixels tall the footer follows the content and is reached by scrolling

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

  @rule-0260 @ears-state-driven
  Rule: While a learning object of a course is open, the reader shall lead the course navigation with that object's title and artwork followed by a parent link, showing its full title, artwork and summary card on request for labs and notebooks and immediately for other resources, in place of a heading on the canvas.

    @active
    Scenario: The side menu leads with a card for what is open
      Given a student opens a topic in the Reference Course
      Then the course navigation's first element is a card naming that topic, picturing it and summarising it
      And a link back to the course follows the card
      And no heading repeats the topic above its cards on the canvas
      And opening a note puts a card for the note at the head of the navigation instead

    @active
    Scenario: Labs and notebooks keep their context compact
      Given a student opens a lab or notebook on a desktop or phone
      Then the course navigation leads with a compact title and 48 pixel artwork row
      And the parent link and steps or outline follow the row
      And the full card is hidden until the student expands the row with the keyboard
      And collapsing the row hides the full card again
      And selecting a step or outline entry closes the phone navigation

    @active
    Scenario: Every kind of resource gets the same way back
      Given a student opens a lab in the Reference Course
      Then the compact context for that lab is followed by a link back to the topic it belongs to, above the step list
      And opening a notebook and then a slide deck in that topic gives each the same link back to the topic

    @inactive
    Scenario: Away from a course the navigation leads with its own sections
      Given a student has opened a course in this session
      When they return to the home page
      Then the course navigation leads with its own first section and carries no learning object card
      And the course's own front page carries no card either, its header already naming and picturing the course

  @rule-0261 @ears-state-driven
  Rule: While a course naming credits in its properties is open on a screen at least 1024 pixels wide, the reader shall follow the course title in the header with those credits in a font smaller than the title's, truncated rather than wrapped.

    @active
    Scenario: Credits follow the course title in the header
      Given a student opens the Reference Course on a 1440 pixel wide screen
      Then the header names the course's credits after its title
      And the credits are in a smaller font than the title
      And opening a lab in that course keeps the credits beside the title
      And a credit too long for the header is cut off rather than wrapped, and the header still fits the viewport

    @inactive
    Scenario: A narrow header carries the title alone
      Given the viewport is 1023 pixels wide
      When a student opens the Reference Course
      Then the header names the course and carries no credits
      And a phone at 390 pixels carries no credits either
      But the same course at 1024 pixels does name them, so the narrow header is hiding them
