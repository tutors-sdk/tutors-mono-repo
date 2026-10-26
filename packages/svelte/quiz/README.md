# @tutors/quiz

Parses quiz definitions authored by hand in course markdown.

The package is deliberately dependency-free and framework-free: it turns text
into data. Rendering lives in `@tutors/ui-components`.

## Authoring a quiz

A quiz is a learning object. Create a folder whose name begins with `quiz-`,
containing a markdown file. That file is an ordinary Tutors document — the
first heading becomes the learning object title — with one fenced `quiz` block:

````markdown
# Recursion Check

Answer these before starting the lab.

```quiz
time_limit: 30
---
question: What does a base case do?
type: multiple-choice
options:
  - Terminates the recursion
  - Starts the recursion
  - Allocates the stack frame
correct: 0
---
question: Every recursive function needs a base case.
type: true-false
correct: true
```
````

Prose outside the fence renders normally, so a quiz can carry instructions,
diagrams or links.

## What a quiz is (and is not)

Quizzes are a **formative self-check**, not a graded assessment. Say so in the
learning object's description, so students know what the result means.

- The answer key is part of the course markdown, so it is sent to the browser
  with the quiz and can be read by anyone who looks.
- Scoring runs in the browser. Nothing is submitted, so a score cannot be
  verified.
- Answers and scores are not stored anywhere. Leaving the page discards them.
- There is no gradebook, attempt limit or identity check, and `time_limit` is
  only a client-side hint.

Use a system built for assessment, such as Moodle, for anything that counts
towards a grade.

Suggested wording for the prose above the `quiz` block:

```markdown
This quiz is a self-check to help you test your understanding. It is not
graded and your answers are not recorded. Assessed quizzes are on Moodle.
```

## Block format

Sections are separated by lines containing only `---`.

An optional **first section** is the header:

| Field | Meaning |
| --- | --- |
| `title` | Quiz title. Omit it and the learning object's own title is used. |
| `time_limit` | Whole seconds allowed per question. Omit for untimed. |

Every **remaining section** is a question:

| Field | Meaning |
| --- | --- |
| `question` | The question text. Required. (`text` is accepted as an alias.) Runs to the next field, so it can span lines and hold a code block. |
| `type` | `multiple-choice` (default) or `true-false`. |
| `options` | A `- ` list. Required for multiple-choice; at least two. Lines indented under an item belong to it. |
| `correct` | Required. 0-based index for multiple-choice; `true`/`false` for true-false. |

## Code blocks

A question or an option can carry a fenced code block, highlighted with the
same code theme as labs and notes.

Open the quiz with **four** backticks (or with `~~~quiz`) so an ordinary
three-backtick fence can sit inside it:

`````markdown
````quiz
question: What does this print?

```js
console.log([1, 2, 3].map((x) => x * 2));
```
type: multiple-choice
options:
  - |
    ```js
    [2, 4, 6]
    ```
  - "`[1, 2, 3]`"
  - It throws a `TypeError`
correct: 0
````
`````

- A question's text runs from `question:` to the next field line (`type:`,
  `options:`, `correct:`, ...), blank lines and code included.
- An option is a `- ` item plus every line indented under it. A YAML-style `|`
  after the dash (or after `question:`) is accepted and ignored.
- Inside a code fence, a `---` line or a `field:` line is code: it never starts
  a new question or field.
- A three-backtick ```` ```quiz ```` block still works when every code fence
  inside it names its language (```` ```js ````). A bare ```` ``` ```` opener
  would close the quiz, which is why four backticks is the recommended form.

Text on one line renders inline, exactly as before. Text that spans lines
renders as a markdown block, so it can also hold paragraphs and lists.

## Validation

A question is **discarded** if it has no `question`, has fewer than two
`options`, or has a `correct` that is missing, non-numeric, or outside the
range of `options`.

This is deliberate. Defaulting a missing or out-of-range `correct` to the first
option would mark the wrong answer correct and mark students down for it
silently, so a malformed question is dropped instead of guessed at. If a block
yields no valid questions at all, the quiz renders as an authoring error.

## Limits

Only the **first** quiz fence in a document is parsed. A second fence is left
in the prose, where it renders as a visible code block — so an accidental extra
block is obvious rather than silent.
