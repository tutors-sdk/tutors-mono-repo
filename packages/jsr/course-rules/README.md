# @tutors/course-rules

The rules core behind `tutors validate` and Tutors Studio. It walks a course folder, reports every problem with the file or folder at fault and a fix written for a lecturer, and never writes.

```ts
import { MemoryFileSystem, validate } from "jsr:@tutors/course-rules";

const findings = await validate(new MemoryFileSystem({ "course.md": "# My course\n", "Week 3/slides.pdf": "%PDF" }));
// [{ rule: "V002", severity: "error", path: "Week 3", message: "The folder \"Week 3\" won't appear in your course ...", suggestedName: "topic-week-3" }]
```

The package has no file-system access of its own. A shell passes a `FileSystemPort` (`list`, `read`, `write`, `move`, `exists`): node:fs in the CLI, Tauri commands in Studio, `MemoryFileSystem` in the reader and in tests. So every shell runs the same rules.

| Id   | Severity | Rule                                                                                                                                                                                                   |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V001 | error    | The course folder has a course.md                                                                                                                                                                      |
| V002 | error    | A folder holding course material (slides, a video id, lab steps, a page named for a kind, a learning object) has a name that starts with a learning-object kind; otherwise the generator leaves it out |
| V003 | error    | Every unit, side and topic has a descriptor .md                                                                                                                                                        |
| V004 | error    | A talk has a .md and one PDF (or a .marp deck or a videoid); a note has one .md; a lab's steps are named `NN.Title.md`                                                                                 |
| V005 | error    | A web link's `weburl` starts with `https://`; a GitHub link's `githubid` is `owner/repo` or its github.com URL                                                                                         |
| V006 | error    | properties.yaml, calendar.yaml, enrollment.yaml and badges.yaml parse and have the shape the generator reads                                                                                           |
| V018 | warn     | A folder of no kind that holds only working files (code, scripts, slide sources) is named, without a fix: students won't see it, which may be intended                                                 |
| V019 | warn     | A lab's steps start at 00 or 01 and skip no number; the generator shows every step either way, in file-name order                                                                                      |

Each rule is an EARS Rule in `tests/bdd/features/instructor/course-validation.feature` (Rules 0695-0700, 0731-0732 for V018 and for a learning object's own resource folders, such as a lab's `assets/`, which are never named, 0740 for V019 and 0741 for a V002 suggestion that keeps a kind the name already has) with a broken and a fixed course under `tests/fixtures/validate/`. A conformance test builds every fixture with the generator and checks that the folders it leaves out are exactly the V002 and V018 findings.

## Quizzes, Marp decks and Mermaid diagrams

| Id   | Severity | Rule                                                                                                                     |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| V013 | error    | Every question in a quiz reaches students: each has text, two or more answers and a right answer that exists             |
| V014 | warn     | A quiz has one quiz block and a time limit in whole seconds                                                              |
| V015 | error    | A Marp deck has `marp: true` in its own or its talk's front matter, so Tutors shows it as slides                         |
| V016 | warn     | A Talk has one Marp deck, on a theme Tutors has (default, gaia, uncover), with no script the reader removes outside code |
| V017 | error    | Every Mermaid diagram draws                                                                                              |

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
deno run -A jsr:@tutors/tutors-create validate [folder] [--format text|json|sarif] [--strict] [--fix | --plan]
```

Exit 3 means the folder could not be read or the arguments were wrong.

`--plan` prints the safe fixes `--fix` would apply as a JSON array of file operations and changes nothing, so a shell such as Studio can show the plan before anything moves (Rule 0745).

## Rewiring a course

`planReorder`, `planMove`, `planRetitle`, `planHide`, `planBin` and `planRestore` sit beside `planFixes` (`src/rewire.ts`). Each returns `{ ok: true, ops, notes }`, the file operations that leave names and files Tutors accepts, or `{ ok: false, reason }` in a lecturer's words. None of them writes; `applyFixes` (or Studio's own apply) does, once the plan is accepted.

- **Reorder** renumbers the items of one kind in a folder (`talk-01-css`, `talk-02-html`), keeping each name after its number. Tutors orders a folder's items by kind first, so items of different kinds are refused.
- **Move** gives an item the next free number of its kind in its new folder, and refuses a folder Tutors would not show that kind in.
- **Retitle** rewrites only the title line of the page the card takes its title from.
- **Hide** adds a top-level topic or unit to `properties.yaml`'s `ignore` list. Tutors can't hide an item inside a topic, so that is refused.
- **Remove** moves the item into `.tutors-bin/` in the course. The generator never reads a folder that starts with a dot, so the item is not published, and nothing is deleted. **Restore** puts it back.

A write that replaces a file is marked `replace: true`. Renaming a top-level folder keeps the `ignore` list pointing at it, and a page that links to a renamed folder by name is named in `notes`. From a terminal:

```sh
deno run -A jsr:@tutors/tutors-create rewire reorder topic-01 talk-02-css talk-01-html [--course folder] [--plan]
deno run -A jsr:@tutors/tutors-create rewire move topic-01/talk-02-css topic-02
deno run -A jsr:@tutors/tutors-create rewire retitle topic-01/talk-01-html "HTML basics"
deno run -A jsr:@tutors/tutors-create rewire hide topic-02        # or show topic-02
deno run -A jsr:@tutors/tutors-create rewire remove topic-01/talk-01-html
deno run -A jsr:@tutors/tutors-create rewire restore talk-01-html topic-01
```

These are Rules 0745-0753 in `tests/bdd/features/instructor/course-rewiring.feature`.
