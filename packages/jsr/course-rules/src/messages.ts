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
  topic: "Topic"
};

export const kindName = (kind: string): string => kindNames[kind] ?? kind;

export const messages = {
  V001: () => "This folder has no course.md, so Tutors can't tell it is a course. Add a course.md whose first line is the course title, like # Web Development.",
  V002: (name: string, suggestion?: string) =>
    `The folder "${name}" won't appear in your course, nor will anything inside it, because its name doesn't start with a kind Tutors knows (topic, unit, talk, note, lab and so on).` +
    (suggestion ? ` Rename it to ${suggestion}.` : " Rename it so it starts with the kind of content it holds, like talk-, note- or lab-."),
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
    `The Lab's steps skip a number: step ${expected} is missing before ${found}. Number the steps 00, 01, 02 and so on with no gaps.`,
  labFirstStep: (found: string) => `The Lab's first step is ${found}. Start the steps at 00 or 01.`,
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
  empty: (kind: string) => `This ${kindName(kind)} is empty so far. That's fine while you are building the course; add content before students see it.`
} as const;
