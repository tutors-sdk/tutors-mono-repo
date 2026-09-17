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
| `question` | The question text. Required. (`text` is accepted as an alias.) |
| `type` | `multiple-choice` (default) or `true-false`. |
| `options` | A `- ` list. Required for multiple-choice; at least two. |
| `correct` | Required. 0-based index for multiple-choice; `true`/`false` for true-false. |

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
