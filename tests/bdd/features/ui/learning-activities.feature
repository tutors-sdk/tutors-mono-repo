@ui @reader
Feature: Quizzes, notebooks and slides
  As a student
  I want interactive content to keep my place
  So that I can work through it at my own pace

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0047 @ears-event-driven
  Rule: When a student moves between quiz questions, the reader shall keep the answers the student has chosen.

    Scenario: Quiz answers survive question navigation
      Given a student has answered the first question
      When the student moves to the next question and back
      Then the first answer is still chosen

  @rule-0048 @ears-event-driven
  Rule: When a student retakes a quiz, the reader shall clear every answer and return to the first question.

    Scenario: Retaking a quiz starts again
      Given a student has submitted a quiz
      When the student selects "Retake"
      Then progress is back at 0 and no answer is chosen

  @rule-0049 @ears-event-driven
  Rule: When a student moves through a notebook, the reader shall show the current cell's number out of the total.

    Scenario: Notebook shows the current cell
      When a student opens a notebook and moves to the next cell
      Then the cell navigation reads "Cell 2 of 19"
      And saved output can be shown and hidden

  @rule-0226 @ears-ubiquitous
  Rule: The reader shall list a notebook's markdown headings in the course navigation in the notebook's order, falling back to every cell when the notebook has no markdown headings.

    Scenario: Notebook headings fill the course navigation
      When a student opens a notebook whose markdown cells carry headings
      Then the course navigation lists those headings in the notebook's order
      And a Python comment at the top of a code cell is not among them

    Scenario: A notebook without headings falls back to its cells
      When a student opens a notebook whose markdown cells carry no heading
      Then the course navigation lists one entry per cell

  @rule-0227 @ears-event-driven
  Rule: When a student moves through a notebook by scrolling, by the outline or by the cell pager, the reader shall mark only the cell being read in the outline.

    Scenario: Notebook outline follows the reader
      When a student opens a notebook and selects the third outline entry
      Then the notebook shows that heading's cell and the outline marks only that entry
      And scrolling on to the next heading moves the mark with it

  @rule-0050 @ears-state-driven
  Rule: While a slide deck has focus, the reader shall move to the next slide when the student presses the right arrow key.

    @active
    Scenario: Arrow keys move a focused slide deck
      Given a student is on slide 2 with the deck focused
      When the student presses the right arrow key
      Then the deck shows slide 3

    @inactive
    Scenario: Arrow keys leave an unfocused slide deck alone
      Given a student is on slide 2 with the page focused
      When the student presses the right arrow key
      Then the deck still shows slide 2
