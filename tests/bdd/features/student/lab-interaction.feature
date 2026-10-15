@student
Feature: Lab Interaction
  As a student
  I want to navigate through lab steps and view content
  So that I can complete hands-on exercises progressively

  Background:
    Given the generator has published the course "web-dev-101" titled "Web Development 101"
    And the topic "HTML Fundamentals" holds the lab "First Web Page"

  @rule-0539 @ears-event-driven
  Rule: When a student opens a lab, the reader shall show its first step with a navigation panel listing every step title.

    Scenario: Navigate through lab steps
      Given the lab has 5 steps
      When a student opens the lab
      Then the system shall display the content for the step "Step 1"
      And the system shall show a navigation panel with the step titles "Step 1, Step 2, Step 3, Step 4, Step 5"

  @rule-0540 @ears-event-driven
  Rule: When a student moves to a lab step, the reader shall show that step, mark it as the current step and offer the steps before and after it.

    Scenario: Move between lab steps
      Given the lab has 5 steps
      And a student is on the step "Step 2"
      When the student moves to the step "Step 4"
      Then the system shall display the content for the step "Step 4"
      And the step navigation shall mark only "Step 4" as the current step
      And the step navigation shall offer "Step 3" as previous and "Step 5" as next

  @rule-0541 @ears-event-driven
  Rule: When a student opens a lab step, the reader shall render its Markdown as HTML and mark each fenced code block with its language.

    Scenario: View lab with mixed content types
      Given a lab step contains markdown with a fenced "javascript" code block
      When a student opens the lab
      Then the system shall render the markdown heading and paragraph as HTML
      And the system shall mark the code block with the language "javascript" for highlighting

  @rule-0542 @ears-event-driven
  Rule: When a student follows a topic breadcrumb from a lab, the reader shall return to that topic.

    Scenario: Navigate via breadcrumbs
      Given the lab has 2 steps
      And a student is viewing the lab
      When the student follows the breadcrumb "HTML Fundamentals"
      Then the system shall navigate back to the topic "HTML Fundamentals" at "/topic/web-dev-101/topic-0"

  @rule-0543 @ears-event-driven
  Rule: When a student opens a lab that was published with a PDF, the reader shall link to the PDF on the course host.

    Scenario: View lab PDF companion
      Given the lab has 2 steps
      And the lab was published with the PDF file "first-web-page.pdf"
      When a student opens the lab
      Then the system shall link to the PDF at "https://web-dev-101.netlify.app/topic-0/lab-0/first-web-page.pdf"
