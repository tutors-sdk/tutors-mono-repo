@instructor
Feature: Quizzes, Marp decks and Mermaid diagrams checked and written
  As an instructor
  I want my quizzes, slide decks and diagrams checked the way the reader shows them, and my quizzes written for me
  So that no question, slide or diagram goes missing in front of students without me hearing about it

  The checks are V013-V017 of @tutors/course-rules (packages/jsr/course-rules/src/rich.ts); the quiz format
  (parse, diagnose, write) is @tutors/course-rules/quiz, which the reader's @tutors/quiz re-exports. Each
  check Rule has a broken and a fixed course under tests/fixtures/validate/<rule>.yaml. Mermaid diagrams are
  checked with the reader's own Mermaid, through the DiagramPort a shell supplies.

  @rule-0724 @ears-unwanted
  Rule: If a quiz page has no quiz block or a question the reader leaves out, then tutors shall report rule V013 against the page, naming each question left out and why.

    Scenario: A question with no right answer and a quiz with no quiz block
      Given the "broken" course of fixture "V013"
      When the course is validated
      Then the findings shall be exactly "V013 error topic-01/quiz-01/quiz.md; V013 error topic-01/quiz-02/quiz.md"
      And the finding for "topic-01/quiz-01/quiz.md" shall say 'Question 2 ("Which tag makes a link?")'
      And the finding for "topic-01/quiz-02/quiz.md" shall also say "finds none"

    Scenario: The same quizzes with every question complete
      Given the "fixed" course of fixture "V013"
      When the course is validated
      Then there shall be no findings

  @rule-0725 @ears-unwanted
  Rule: If a quiz page has a second quiz block or a time limit that is not a whole number of seconds, then tutors shall report rule V014 as a warning against the page.

    Scenario: A time limit in words and a second quiz block
      Given the "broken" course of fixture "V014"
      When the course is validated
      Then the findings shall be exactly "V014 warn topic-01/quiz-01/quiz.md; V014 warn topic-01/quiz-01/quiz.md"

    Scenario: One quiz block timed in seconds
      Given the "fixed" course of fixture "V014"
      When the course is validated
      Then there shall be no findings

  @rule-0726 @ears-unwanted
  Rule: If a Talk's Marp deck has no marp true in its own front matter or its talk's, then tutors shall report rule V015 against the deck.

    Scenario: A deck that names a theme but not marp true
      Given the "broken" course of fixture "V015"
      When the course is validated
      Then the findings shall be exactly "V015 error topic-01/talk-01/talk.marp"
      And the finding for "topic-01/talk-01/talk.marp" shall say "won't show it as slides"

    Scenario: The same deck with marp true
      Given the "fixed" course of fixture "V015"
      When the course is validated
      Then there shall be no findings

  @rule-0727 @ears-unwanted
  Rule: If a Talk holds more than one Marp deck, a deck asks for a theme Tutors does not have, or a slide holds a script, handler or javascript: link the reader removes outside its code, then tutors shall report rule V016 as a warning.

    Scenario: Two decks, an unknown theme and a button with a click handler
      Given the "broken" course of fixture "V016"
      When the course is validated
      Then the findings shall be exactly "V016 warn topic-01/talk-01; V016 warn topic-01/talk-01/talk.marp; V016 warn topic-01/talk-01/talk.marp"
      And the finding for "topic-01/talk-01" shall say "shows only one of them"

    Scenario: One deck on a built-in theme with no script, naming JavaScript in prose and showing a script as code
      Given the "fixed" course of fixture "V016"
      When the course is validated
      Then there shall be no findings

  @rule-0728 @ears-optional
  Rule: Where a shell supplies a diagram checker, tutors shall report rule V017 against each page or deck with a Mermaid diagram that does not draw, naming the line where Mermaid stopped.

    @active
    Scenario: An unclosed bracket and a misspelt diagram type, checked with the reader's Mermaid
      Given the "broken" course of fixture "V017"
      When the course is validated with the reader's Mermaid
      Then the findings shall be exactly "V017 error topic-01/note-01/note.md; V017 error topic-01/note-01/note.md"
      And a finding shall say "Mermaid stopped at line 3 of the diagram: Server[Web server --> Browser"
      And another finding shall say 'its first line, "flowhcart TD"'

    @active
    Scenario: The same diagrams fixed
      Given the "fixed" course of fixture "V017"
      When the course is validated with the reader's Mermaid
      Then there shall be no findings

    @inactive
    Scenario: Without a diagram checker the broken diagrams are not reported
      Given the "broken" course of fixture "V017"
      When the course is validated
      Then there shall be no findings

  @rule-0729 @ears-event-driven
  Rule: When a quiz is written from a lecturer's draft, tutors shall write a quiz block that the reader reads back to the same questions.

    Scenario: Multiple choice with code in an answer, and true or false
      Given a draft quiz "Week 3 check" timed at 45 seconds
      And a multiple-choice question "What does this print?" with answers "2", "```js\n'11'\n```" and "nothing", the first right
      And a true-or-false question "JavaScript is compiled to bytecode." whose answer is false
      When the quiz is written
      Then the reader reads back 2 questions titled "Week 3 check" timed at 45 seconds
      And question 2 has the answers "True" and "False" with "False" right

  @rule-0730 @ears-unwanted
  Rule: If a lecturer's draft holds a question the reader cannot show as built, then tutors shall refuse to write the quiz and name the question and why.

    Scenario: A second question with only one answer
      Given a draft quiz "Week 3 check" timed at 0 seconds
      And a multiple-choice question "Which is a tag?" with answers "<a>" and "<link>", the first right
      And a multiple-choice question "Pick one" with the single answer "only"
      When the quiz is written
      Then writing is refused for question 2 because "too-few-options"
