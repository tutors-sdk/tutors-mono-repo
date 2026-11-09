import type { QuestionProblem } from "./quiz/parser.ts";

/**
 * Every sentence a lecturer reads about their course. The CLI, Studio and the reader wizard print these
 * strings and add none of their own, so the three always say the same thing. Written for a lecturer,
 * never a developer: "This folder won't appear in your course", not "unknown LO type".
 */
const kindNames: Record<string, string> = {
  talk: "Talk",
  paneltalk: "Panel talk",
  note: "Note",
  panelnote: "Panel note",
  lab: "Lab",
  web: "Web link",
  github: "GitHub link",
  unit: "Unit",
  side: "Side unit",
  topic: "Topic",
  quiz: "Quiz"
};

export const kindName = (kind: string): string => kindNames[kind] ?? kind;

/** The end of the sentence "Question N won't appear in the quiz, because ...". */
const quizReasons: Record<QuestionProblem, (optionCount: number, answer: string) => string> = {
  "no-text": () => "it has no question text. Start it with question: and the question.",
  "too-few-options": (count) => `it has ${count === 1 ? "one answer" : `${count} answers`} to choose from. A question needs at least two.`,
  "no-answer": () => "it doesn't say which answer is right. Add correct: and the number of the right answer, counting the first as 0.",
  "answer-out-of-range": (count, answer) => `its right answer is number ${answer}, but its answers are numbered 0 to ${count - 1}. Answers are counted from 0, so the first is 0.`,
  "answer-not-true-false": (_count, answer) => `it is a true-or-false question whose right answer is "${answer}". Write correct: true or correct: false.`
};

/** What a lecturer reads when a quiz they are building can't be saved yet, by QuizDraftError problem. */
const quizDraftReasons: Record<string, string> = {
  "no-questions": "Add a question before saving the quiz.",
  "no-text": "type the question.",
  "too-few-options": "add at least two answers to choose from.",
  "empty-option": "one of the answers is blank. Type it, or remove it.",
  "answer-out-of-range": "pick the right answer.",
  unreadable: 'something in this question can\'t be saved as you typed it. A line starting with "options:" is the usual cause; reword that line.'
};

export const messages = {
  V001: () => "This folder has no course.md, so Tutors can't tell it is a course. Add a course.md whose first line is the course title, like # Web Development.",
  V002: (name: string, suggestion?: string) =>
    `The folder "${name}" won't appear in your course, nor will anything inside it, because its name doesn't start with a kind Tutors knows (topic, unit, talk, note, lab and so on).` +
    (suggestion ? ` Rename it to ${suggestion}.` : " Rename it so it starts with the kind of content it holds, like talk-, note- or lab-."),
  V018: (name: string, suggestion?: string) =>
    `The folder "${name}" isn't part of your course, because its name doesn't start with a kind Tutors knows, so students won't see it. That's fine for working files such as code, scripts or slide sources.` +
    (suggestion
      ? ` If it holds course material, rename it to ${suggestion}.`
      : " If it holds course material, rename it so it starts with the kind of content it holds, like talk- or note-."),
  V003: (kind: string) => `This ${kindName(kind)} has no .md file, so its card has no title. Add one, like ${kind}.md, whose first line is the title.`,
  talkMissingDescriptor: () => "This Talk has no .md file, so it has no title. Add a talk.md whose first line is the talk's title.",
  talkNoSlides: () => "This Talk has no slides. A Talk needs one PDF (or a Marp .marp deck, or a videoid file). Drop the PDF in this folder.",
  talkTwoPdfs: (pdfs: string[]) =>
    `This Talk holds ${pdfs.length} PDFs (${pdfs.join(", ")}), but Tutors shows only the first. Keep one, and give each other deck its own talk- folder.`,
  noteMissing: () => "This Note has no .md file, so it is empty. Add one .md file with the note's text.",
  noteTwoFiles: (files: string[]) =>
    `This Note holds ${files.length} .md files (${files.join(", ")}), but Tutors shows only the first. Keep one, and give each other its own note- folder.`,
  labNoSteps: () => "This Lab has no steps. Add the steps as numbered files: 00.Setup.md, 01.Step-01.md, 02.Step-02.md and so on.",
  labStepName: (file: string) => `"${file}" is in a Lab but isn't named as a step. Name each step with two digits, a dot and a title, like 01.Setup.md.`,
  labStepOrder: (expected: string, found: string) =>
    `The Lab's steps skip a number: step ${expected} is missing before ${found}. Students still see every step, in file-name order; number them 00, 01, 02 and so on so the order stays easy to follow.`,
  labFirstStep: (found: string) => `The Lab's first step is ${found}. Students still see every step; start the steps at 00 or 01 so the order stays easy to follow.`,
  linkMissing: (kind: string, file: string) =>
    `This ${kindName(kind)} has no ${file} file. Add a file named ${file} whose first line is the ${kind === "web" ? "web address" : "repository address"}.`,
  linkEmpty: (kind: string, file: string) =>
    `The ${file} file of this ${kindName(kind)} doesn't start with ${kind === "web" ? "a web address (https://…)" : "a repository (https://github.com/owner/repo or owner/repo)"}. Put the address on its first line and nothing else.`,
  yamlBroken: (file: string, detail: string) =>
    `${file} can't be read: ${detail}. Check the indentation (spaces, not tabs) and that every "name: value" line has a space after the colon.`,
  yamlShape: (file: string, expected: string) => `${file} is readable but not in the expected shape: ${expected}.`,
  folderName: (name: string, suggestion: string) =>
    `The folder "${name}" has capitals, spaces or accents in its name, which break links when the course moves between Windows, a Mac and the web. Rename it to ${suggestion}.`,
  fileName: (name: string, suggestion: string) =>
    `The file "${name}" has spaces or accents in its name, which break links when the course moves between Windows, a Mac and the web. Rename it to ${suggestion}.`,
  noTitle: (file: string) => `${file} has no title, so its card shows a blank heading. Put the title on the first line, like # Week 1.`,
  imageMissing: (src: string) => `This page shows the image "${src}", but there is no such file next to it, so readers see a broken image. Add the image or fix the name.`,
  imageLarge: (src: string, megabytes: string) =>
    `The image "${src}" is ${megabytes} MB, so the page is slow to open on a phone. Shrink it below 2 MB (a screenshot saved as .jpg usually is).`,
  topicUnnumbered: (name: string) =>
    `The topic "${name}" has no number, so it sits in alphabetical order among its numbered neighbours. Name the topics topic-01, topic-02 and so on.`,
  topicOutOfSequence: (expected: string, found: string) =>
    `The topics here skip from ${expected} to ${found}, so the reader may show them in an order you don't expect. Number them in sequence with two digits: topic-01, topic-02 and so on.`,
  netlifyMissing: () => "This course has no netlify.toml, so Netlify won't know how to build and publish it. Add the standard one (tutors validate --fix writes it).",
  netlifyPublish: () =>
    `netlify.toml doesn't publish the folder Tutors generates, so the site deploys to a "Page not found". Set publish = "json" under [build] (or "html" for tutors-lite).`,
  quizNoFile: () => "This Quiz has no .md file, so it is empty. Add one .md file whose first line is the quiz's title, with the questions in a quiz block.",
  quizNoBlock: () => "This Quiz has no questions: the reader looks for them in a quiz block (a fence that opens with ```quiz) and finds none. Add the questions in a quiz block.",
  quizEmpty: () => "This Quiz's quiz block holds no questions yet. Add at least one before students see it.",
  quizQuestion: (number: number, excerpt: string, problem: QuestionProblem, optionCount = 0, answer = "") =>
    `Question ${number}${excerpt ? ` ("${excerpt}")` : ""} won't appear in the quiz, because ${quizReasons[problem](optionCount, answer)}`,
  /** Why Studio's quiz designer can't save a quiz yet; `question` is 1-based, null for the quiz as a whole. */
  quizDraft: (question: number | null, problem: string) => (question === null ? "" : `Question ${question}: `) + (quizDraftReasons[problem] ?? quizDraftReasons.unreadable),
  quizSecondBlock: () => "This Quiz has a second quiz block, which the reader ignores and shows as code. Move its questions into the first quiz block.",
  quizTimeLimit: (value: string) =>
    `The quiz's time limit is "${value}", which isn't a whole number of seconds, so the quiz runs untimed. Write it as a number, like time_limit: 30.`,
  marpNotSlides: (file: string) =>
    `${file} is a Marp deck, but it doesn't start with marp: true, so Tutors won't show it as slides. Put three lines at the very top: ---, then marp: true, then ---.`,
  marpTwoDecks: (decks: string[]) =>
    `This Talk holds ${decks.length} Marp decks (${decks.join(", ")}), but Tutors shows only one of them. Keep one, and give each other deck its own talk- folder.`,
  marpTheme: (file: string, theme: string) =>
    `${file} asks for the Marp theme "${theme}", which Tutors doesn't have, so the slides use the default theme. Use default, gaia or uncover.`,
  marpScript: (file: string, slide: number) =>
    `Slide ${slide} of ${file} has a script, an on...= handler or a javascript: link. The reader removes these to keep students safe, so that part of the slide won't work.`,
  diagramBroken: (file: string, line: number, diagramLine: number | undefined, text: string) =>
    `The diagram starting on line ${line} of ${file} won't draw, so students see "Failed to render diagram" instead.` +
    (diagramLine === undefined
      ? " Check it in the Mermaid live editor (mermaid.live)."
      : ` Mermaid stopped at line ${diagramLine} of the diagram${text ? `: ${text}` : ""}. Check the brackets and arrows there.`),
  diagramUnknown: (file: string, line: number, first: string) =>
    `The diagram starting on line ${line} of ${file} won't draw: its first line, "${first}", isn't a kind of diagram Mermaid knows. Start it with one, like flowchart TD, sequenceDiagram or pie.`,
  empty: (kind: string) => `This ${kindName(kind)} is empty so far. That's fine while you are building the course; add content before students see it.`
} as const;
