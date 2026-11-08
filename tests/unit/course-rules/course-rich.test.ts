import { describe, expect, it } from "vitest";
import {
  MemoryFileSystem,
  mermaidBlocks,
  mermaidDiagrams,
  messages,
  ruleCatalogue,
  validate,
  type DiagramCheck,
  type DiagramPort
} from "../../../packages/jsr/course-rules/src/mod.ts";
import { frontMatterOf } from "../../../packages/jsr/course-rules/src/rich.ts";

const NETLIFY = '[build]\n  publish = "json"\n';
const course = (files: Record<string, string>) => new MemoryFileSystem({ "course.md": "# C\n", "netlify.toml": NETLIFY, "topic-01/topic.md": "# T\n", ...files });
const findings = async (files: Record<string, string>, rule: string, diagrams?: DiagramPort) =>
  (await validate(course(files), "", { diagrams })).filter((f) => f.rule === rule).map((f) => `${f.path} :: ${f.message}`);

describe("the catalogue", () => {
  it("lists V013-V017 with their severities", () => {
    expect(ruleCatalogue.slice(12).map((info) => `${info.id} ${info.severity}`)).toEqual(["V013 error", "V014 warn", "V015 error", "V016 warn", "V017 error"]);
  });
});

describe("V013 quizzes", () => {
  it("names a quiz folder with no page", async () => {
    expect(await findings({ "topic-01/quiz-01/notes.txt": "x" }, "V013")).toEqual([`topic-01/quiz-01 :: ${messages.quizNoFile()}`]);
  });

  it("reads a quiz with Windows line endings as the reader does", async () => {
    const page = "# Q\r\n\r\n```quiz\r\nquestion: Q?\r\noptions:\r\n  - a\r\n  - b\r\ncorrect: 1\r\n```\r\n";
    expect(await findings({ "topic-01/quiz-01/quiz.md": page }, "V013")).toEqual([]);
  });

  it("says why each dropped question is dropped, in a lecturer's words", () => {
    expect(messages.quizQuestion(3, "Pick one", "too-few-options", 1)).toBe(
      'Question 3 ("Pick one") won\'t appear in the quiz, because it has one answer to choose from. A question needs at least two.'
    );
    expect(messages.quizQuestion(1, "", "too-few-options", 0)).toBe("Question 1 won't appear in the quiz, because it has 0 answers to choose from. A question needs at least two.");
    expect(messages.quizQuestion(2, "Q", "no-text")).toContain("it has no question text");
    expect(messages.quizQuestion(2, "Q", "no-answer")).toContain("it doesn't say which answer is right. Add correct:");
    expect(messages.quizQuestion(2, "Q", "answer-out-of-range", 3, "3")).toContain("its right answer is number 3, but its answers are numbered 0 to 2.");
    expect(messages.quizQuestion(2, "Q", "answer-not-true-false", 2, "yes")).toContain('right answer is "yes". Write correct: true or correct: false.');
    expect(messages.quizEmpty()).toContain("holds no questions yet");
    expect(messages.quizDraft(null, "no-questions")).toBe("Add a question before saving the quiz.");
    expect(messages.quizDraft(2, "no-text")).toBe("Question 2: type the question.");
    expect(messages.quizDraft(1, "too-few-options")).toBe("Question 1: add at least two answers to choose from.");
    expect(messages.quizDraft(1, "empty-option")).toBe("Question 1: one of the answers is blank. Type it, or remove it.");
    expect(messages.quizDraft(3, "answer-out-of-range")).toBe("Question 3: pick the right answer.");
    expect(messages.quizDraft(1, "unreadable")).toBe(
      'Question 1: something in this question can\'t be saved as you typed it. A line starting with "options:" is the usual cause; reword that line.'
    );
    expect(messages.quizDraft(1, "something new")).toBe(messages.quizDraft(1, "unreadable"));
  });

  it("names an empty quiz block", async () => {
    expect(await findings({ "topic-01/quiz-01/quiz.md": "# Q\n\n```quiz\n```\n" }, "V013")).toEqual([`topic-01/quiz-01/quiz.md :: ${messages.quizEmpty()}`]);
  });
});

describe("V015 and V016 Marp decks", () => {
  const talk = (deck: string, md = "# Talk\n", name = "talk.marp") => ({ "topic-01/talk-01/talk.md": md, [`topic-01/talk-01/${name}`]: deck });

  it("reads front matter as YAML, ignoring a block that isn't a map or doesn't parse", () => {
    expect(frontMatterOf("---\nmarp: true\ntheme: gaia\n---\n# x")).toEqual({ marp: true, theme: "gaia" });
    expect(frontMatterOf("---\r\nmarp: true\r\n---")).toEqual({ marp: true });
    expect(frontMatterOf("# no front matter")).toEqual({});
    expect(frontMatterOf("# Title\n---\nmarp: true\n---\n")).toEqual({});
    expect(frontMatterOf("---\n- a list\n---\n")).toEqual({});
    expect(frontMatterOf("---\nmarp\n---\n")).toEqual({});
    expect(frontMatterOf("---\nmarp: [unclosed\n---\n")).toEqual({});
  });

  it("accepts marp: true written as a string, and in a panel talk", async () => {
    expect(await findings(talk('---\nmarp: "TRUE"\n---\n# x\n'), "V015")).toEqual([]);
    expect(await findings({ "topic-01/paneltalk-01/talk.md": "# P\n", "topic-01/paneltalk-01/deck.marp": "# x\n" }, "V015")).toEqual([
      `topic-01/paneltalk-01/deck.marp :: ${messages.marpNotSlides("deck.marp")}`
    ]);
  });

  it("checks a deck in a talk with no .md, and takes the theme from the talk's .md", async () => {
    expect(await findings({ "topic-01/talk-01/talk.marp": "# x\n" }, "V015")).toEqual([`topic-01/talk-01/talk.marp :: ${messages.marpNotSlides("talk.marp")}`]);
    expect(await findings(talk("---\nmarp: true\n---\n# x\n", "---\ntheme: night\n---\n# Talk\n"), "V016")).toEqual([
      `topic-01/talk-01/talk.marp :: ${messages.marpTheme("talk.marp", "night")}`
    ]);
    expect(await findings(talk("---\nmarp: true\ntheme: uncover\n---\n# x\n"), "V016")).toEqual([]);
  });

  it("names each slide with something the reader strips, and only those", async () => {
    const deck =
      '---\nmarp: true\n---\n# One\n\n<script>alert(1)</script>\n\n---\n\n## Two, onboarding=fine as text\n\n---\n\n[x](javascript:alert(1))\n\n---\n\n<img src=x onerror = "y">\n';
    expect(await findings(talk(deck), "V016")).toEqual([1, 3, 4].map((slide) => `topic-01/talk-01/talk.marp :: ${messages.marpScript("talk.marp", slide)}`));
  });

  it("lets the talk page's front matter win over the deck's, as gen's talk builder does", async () => {
    expect(await findings(talk("---\nmarp: true\n---\n# x\n", "---\nmarp: false\n---\n# Talk\n"), "V015")).toEqual([
      `topic-01/talk-01/talk.marp :: ${messages.marpNotSlides("talk.marp")}`
    ]);
    expect(await findings(talk("---\nmarp: true\ntheme: gaia\n---\n# x\n", "---\ntheme: night\n---\n# Talk\n"), "V016")).toEqual([
      `topic-01/talk-01/talk.marp :: ${messages.marpTheme("talk.marp", "night")}`
    ]);
  });

  it("ignores markup a slide shows as code, which Marp escapes", async () => {
    const deck =
      '---\nmarp: true\n---\n```html\n<script>alert(1)</script>\n```\n\nUse `<a href="javascript:x">` or ``on`click=`` never.\n\n---\n\n~~~~\n<img onerror=y>\n~~~\nstill code\n~~~~\n\n---\n\n`` `<script>` ``\n\n---\n\n```\nshown\n```\n<script>real</script> `unclosed\n';
    expect(await findings(talk(deck), "V016")).toEqual([`topic-01/talk-01/talk.marp :: ${messages.marpScript("talk.marp", 4)}`]);
  });

  it("checks the images a deck shows under V009", async () => {
    const deck = "---\nmarp: true\n---\n![bg left](img/missing.png)\n";
    expect(await findings(talk(deck), "V009")).toEqual([`topic-01/talk-01/talk.marp :: ${messages.imageMissing("img/missing.png")}`]);
  });
});

describe("V017 Mermaid diagrams", () => {
  const page = (body: string) => ({ "topic-01/note-01/note.md": `# Note\n\n${body}` });
  const port = (check: DiagramCheck, seen: string[] = []): DiagramPort => ({
    mermaid: async (source) => {
      seen.push(source);
      return check;
    }
  });

  it("finds fenced mermaid blocks with the line each diagram starts on", () => {
    expect(mermaidBlocks("x\n```mermaid\nflowchart TD\n  A-->B\n```\ny\n~~~~ Mermaid \npie\n~~~~\n```js\nmermaid\n```\n````mermaid\nunclosed")).toEqual([
      { source: "flowchart TD\n  A-->B", line: 3 },
      { source: "pie", line: 8 },
      { source: "unclosed", line: 14 }
    ]);
    expect(mermaidBlocks("```mermaid\r\na\r\n```")).toEqual([{ source: "a", line: 2 }]);
    expect(mermaidBlocks("see ```mermaid\nx\n```\n```mermaidjs\ny\n```")).toEqual([]);
    expect(mermaidBlocks("````mermaid\n```\nstill inside\n````")).toEqual([{ source: "```\nstill inside", line: 2 }]);
    expect(mermaidBlocks("````markdown\n```mermaid\nexample\n```\n````\n```mermaid\nreal\n```")).toEqual([{ source: "real", line: 7 }]);
    expect(mermaidBlocks("~~~\n```mermaid\n~~~~\n```mermaid\nafter\n```")).toEqual([{ source: "after", line: 5 }]);
  });

  it("does not run without a diagram checker, and skips empty diagrams", async () => {
    const seen: string[] = [];
    expect(await findings(page("```mermaid\nnot a diagram\n```\n"), "V017")).toEqual([]);
    expect(await findings(page("```mermaid\n  \n```\n```mermaid\nflowchart TD\n```\n"), "V017", port({ draws: true }, seen))).toEqual([]);
    expect(seen).toEqual(["flowchart TD"]);
  });

  it("checks decks as well as pages, and makes no finding when the checker can't tell", async () => {
    const files = { ...page("```mermaid\nclassDiagram\n```\n"), "topic-01/talk-01/talk.md": "# T\n", "topic-01/talk-01/talk.marp": "---\nmarp: true\n---\n```mermaid\nx\n```\n" };
    expect(await findings(files, "V017", port({ draws: "unknown" }))).toEqual([]);
    expect((await findings(files, "V017", port({ draws: false }))).map((f) => f.split(" :: ")[0])).toEqual(["topic-01/note-01/note.md", "topic-01/talk-01/talk.marp"]);
  });

  it("says where Mermaid stopped, when it says", async () => {
    expect(await findings(page("```mermaid\nflowchart TD\n  A[x --> B\n```\n"), "V017", port({ draws: false, line: 2 }))).toEqual([
      `topic-01/note-01/note.md :: ${messages.diagramBroken("note.md", 4, 2, "A[x --> B")}`
    ]);
    expect(await findings(page("```mermaid\nflowchart TD\n```\n"), "V017", port({ draws: false, line: 9 }))).toEqual([
      `topic-01/note-01/note.md :: ${messages.diagramBroken("note.md", 4, 9, "")}`
    ]);
    expect(messages.diagramBroken("note.md", 4, undefined, "")).toBe(
      'The diagram starting on line 4 of note.md won\'t draw, so students see "Failed to render diagram" instead. Check it in the Mermaid live editor (mermaid.live).'
    );
    expect(messages.diagramBroken("note.md", 4, 2, "")).toContain("Mermaid stopped at line 2 of the diagram. Check");
    expect(await findings(page("```mermaid\n\nflowhcart TD\n```\n"), "V017", port({ draws: false, unknownType: true }))).toEqual([
      `topic-01/note-01/note.md :: ${messages.diagramUnknown("note.md", 4, "flowhcart TD")}`
    ]);
  });
});

describe("mermaidDiagrams", () => {
  const failing = (error: unknown) => mermaidDiagrams({ parse: async () => Promise.reject(error) });
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("maps Mermaid's answers onto a DiagramCheck", async () => {
    expect(await mermaidDiagrams({ parse: async () => ({ diagramType: "pie" }) }).mermaid("pie")).toEqual({ draws: true });
    expect(await failing(Object.assign(new Error("Parse error on line 3"), { hash: { loc: { first_line: 2 } } })).mermaid("x")).toEqual({ draws: false, line: 2 });
    expect(await failing(named("UnknownDiagramError")).mermaid("x")).toEqual({ draws: false, unknownType: true });
    expect(await failing(new TypeError("DOMPurify.addHook is not a function")).mermaid("x")).toEqual({ draws: "unknown" });
    expect(await failing({ hash: { loc: {} } }).mermaid("x")).toEqual({ draws: "unknown" });
    expect(await failing({ hash: {} }).mermaid("x")).toEqual({ draws: "unknown" });
    expect(await failing(null).mermaid("x")).toEqual({ draws: "unknown" });
    expect(await failing("UnknownDiagramError").mermaid("x")).toEqual({ draws: "unknown" });
  });

  it("passes the diagram's source to Mermaid unchanged", async () => {
    const seen: string[] = [];
    await mermaidDiagrams({ parse: async (text) => seen.push(text) }).mermaid("flowchart TD\n  A-->B");
    expect(seen).toEqual(["flowchart TD\n  A-->B"]);
  });
});
