# @tutors/course-rules

The rules core behind `tutors validate` and Tutors Studio. It walks a course folder, reports every problem with the file or folder at fault and a fix written for a lecturer, and never writes.

```ts
import { MemoryFileSystem, validate } from "jsr:@tutors/course-rules";

const findings = await validate(new MemoryFileSystem({ "course.md": "# My course\n", "Week 3/slides.pdf": "%PDF" }));
// [{ rule: "V002", severity: "error", path: "Week 3", message: "The folder \"Week 3\" won't appear in your course ...", suggestedName: "topic-week-3" }]
```

The package has no file-system access of its own. A shell passes a `FileSystemPort` (`list`, `read`, `write`, `move`, `exists`): node:fs in the CLI, Tauri commands in Studio, `MemoryFileSystem` in the reader and in tests. So every shell runs the same rules.

| Id   | Severity | Rule                                                                                                                                                         |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V001 | error    | The course folder has a course.md                                                                                                                            |
| V002 | error    | Every folder's name starts with a learning-object kind, is hidden (`.`), or holds only images; anything else is left out of the course by the generator      |
| V003 | error    | Every unit, side and topic has a descriptor .md                                                                                                              |
| V004 | error    | A talk has a .md and one PDF (or a .marp deck or a videoid); a note has one .md; a lab's steps are named `NN.Title.md`, start at 00 or 01 and skip no number |
| V005 | error    | A web link's `weburl` starts with `https://`; a GitHub link's `githubid` is `owner/repo` or its github.com URL                                               |
| V006 | error    | properties.yaml, calendar.yaml, enrollment.yaml and badges.yaml parse and have the shape the generator reads                                                 |

Each rule is an EARS Rule in `tests/bdd/features/instructor/course-validation.feature` (Rules 0695-0700) with a broken and a fixed course under `tests/fixtures/validate/`. A conformance test builds every fixture with the generator and checks that the folders it leaves out are exactly the V002 findings.

## Quizzes, Marp decks and Mermaid diagrams

| Id   | Severity | Rule                                                                                                         |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------ |
| V013 | error    | Every question in a quiz reaches students: each has text, two or more answers and a right answer that exists |
| V014 | warn     | A quiz has one quiz block and a time limit in whole seconds                                                  |
| V015 | error    | A Marp deck has `marp: true` in its own or its talk's front matter, so Tutors shows it as slides             |
| V016 | warn     | A Talk has one Marp deck, on a theme Tutors has (default, gaia, uncover), with no script the reader removes  |
| V017 | error    | Every Mermaid diagram draws                                                                                  |

V009 also checks the images a Marp deck shows. These are Rules 0724-0728 in `tests/bdd/features/instructor/course-rich-content.feature`; a conformance test builds the V015 fixtures with the generator and checks it shows the deck as slides exactly when V015 is silent.

V017 needs Mermaid, which the package does not import. A shell that has it hands `validate` a `DiagramPort`, most simply the adapter over Mermaid itself:

```ts
import mermaid from "mermaid";
import { mermaidDiagrams, validate } from "jsr:@tutors/course-rules";

const findings = await validate(fs, "", { diagrams: mermaidDiagrams(mermaid) });
```

Without one, V017 does not run. A diagram the checker cannot judge (a type that needs a browser, under Node) is never reported.

The quiz format lives in `@tutors/course-rules/quiz`, so the reader, the validator and Studio read and write quizzes one way: `extractQuizBlock` and `parseQuizMarkdown` (what the reader shows), `diagnoseQuiz` (what it would leave out, and why) and `writeQuizBlock` / `writeQuizPage` (a lecturer's draft as the markdown the reader reads back to the same questions; Rules 0729-0730). The reader's `@tutors/quiz` re-exports the parser and adds scoring.

## Reports and exit codes

`report(findings, "text" | "json" | "sarif", version, root)` renders findings for a person, for a program (the JSON array of findings Studio and CI read) or for GitHub code scanning (SARIF 2.1.0, a finding on the course folder located at `course.md`). `exitCodeFor(findings, strict)` is 0 when clean, 1 with errors, 2 with only warnings under `--strict`.

From a terminal:

```sh
deno run -A jsr:@tutors/tutors-create validate [folder] [--format text|json|sarif] [--strict]
```

Exit 3 means the folder could not be read or the arguments were wrong.
