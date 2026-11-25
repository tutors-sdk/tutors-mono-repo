@student
Feature: Code blocks in quizzes
  As a lecturer writing a self-check quiz, and a student taking it
  I want a question or an option to carry a fenced code block
  So that a quiz can ask about real code, shown the way the labs show it

  A quiz is a fenced `quiz` block in a quiz learning object's markdown
  (packages/domain/src/quiz/README.md). A question's text runs from `question:` to the next
  field, and an option is a `- ` item with the lines indented under it, so either can hold a
  fenced code block. Each quiz below is a file in tests/fixtures/quiz-code-blocks, written as a
  lecturer would write it. These Rules drive the reader's quiz splitter and parser, and the renderer
  QuizQuestion uses for question and option text.

  @rule-0669 @ears-ubiquitous
  Rule: The reader shall show a fenced code block written under a quiz question as part of that question.

    Scenario: A question carries a JavaScript snippet
      Given the quiz question in "js-question.md"
      When the reader parses the quiz
      Then the question text shall be "What does this print?" followed by the "js" block "console.log([1, 2, 3].map((x) => x * 2));"
      And the question shall have 2 options

    Scenario: A one-line question reads as it always has
      Given the quiz question in "one-line-question.md"
      When the reader parses the quiz
      Then the question text shall be "Which keyword is block-scoped?"

  @rule-0670 @ears-ubiquitous
  Rule: The reader shall show a fenced code block indented under a quiz option as part of that option.

    Scenario: Each option is a snippet
      Given the quiz question in "python-options.md"
      When the reader parses the quiz
      Then option 1 shall be the "python" block "for i in range(3):\n    print(i)"
      And option 2 shall be the "python" block "for i in range(1, 3):\n    print(i)"
      And option 3 shall be "Neither"
      And the correct answer shall be option 1

  @rule-0671 @ears-unwanted
  Rule: If a code block in a quiz contains a line of three dashes or a field name, then the reader shall keep that line in the code block.

    Scenario: YAML front matter inside a question stays in the snippet
      Given the quiz question in "yaml-question.md"
      When the reader parses the quiz
      Then the quiz shall have 1 question
      And the question text shall be "Which field is missing from this front matter?" followed by the "yaml" block "---\ntype: lab\n---"

  @rule-0672 @ears-ubiquitous
  Rule: The reader shall render a code block in a quiz question or option with the syntax highlighting and code theme used for lab steps.

    Scenario: A quiz snippet renders like a lab snippet
      Given the code theme is "github-light"
      When the reader renders the quiz text "What does this print?\n\n```js\nlet x = 1;\n```"
      Then the code block shall be highlighted as "js" in the theme "github-light"
      And the rendered code block shall match a lab step rendering the same markdown

    Scenario: One-line quiz text stays inline
      When the reader renders the quiz text "Use `const` here"
      Then the rendered text shall be "Use <code>const</code> here" with no paragraph or code block

  @rule-0673 @ears-unwanted
  Rule: If a quiz fence opened with three backticks contains a code fence that names its language, then the reader shall keep that code fence inside the quiz.

    Scenario: A three-backtick quiz with a nested snippet
      Given the quiz learning object in "three-backtick-quiz.md"
      When the reader splits the quiz from its prose
      Then the prose shall be "# Arrays Check\n\nGood luck."
      And the quiz shall have 1 question
