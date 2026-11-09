import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { MemoryFileSystem, mermaidDiagrams, validate, type Finding, type MermaidParser } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { extractQuizBlock, parseQuizMarkdown, QuizDraftError, writeQuizBlock, type ParsedQuiz, type QuizDraft } from "../../../../packages/jsr/course-rules/src/quiz/mod.ts";
import { validateFixture, type FixtureForm } from "../../../support/validate-fixtures.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-rich-content.feature");

/** The Mermaid the reader draws with, loaded from the package that renders it. */
async function readersMermaid(): Promise<MermaidParser> {
  const path = createRequire(resolve("packages/svelte/course/package.json")).resolve("mermaid");
  return (await import(path)).default as MermaidParser;
}

describeFeature(feature, ({ Rule }) => {
  let course: MemoryFileSystem;
  let findings: Finding[];
  let draft: QuizDraft;
  let read: ParsedQuiz | null;
  let refused: QuizDraftError | null;

  const givenFixture = (_ctx: unknown, form: string, rule: string) => {
    course = new MemoryFileSystem(validateFixture(rule, form as FixtureForm));
  };
  const whenValidated = async () => {
    findings = await validate(course);
  };
  const whenValidatedWithMermaid = async () => {
    findings = await validate(course, "", { diagrams: mermaidDiagrams(await readersMermaid()) });
  };
  const exactly = (_ctx: unknown, expected: string) => {
    const actual = findings.map((f) => `${f.rule} ${f.severity} ${f.path}`).sort();
    expect(actual).toEqual(expected.split("; ").sort());
  };
  const none = () => expect(findings).toEqual([]);
  const says = (_ctx: unknown, path: string, text: string) =>
    expect(
      findings
        .filter((f) => f.path === path)
        .map((f) => f.message)
        .join("\n")
    ).toContain(text);
  const anySays = (_ctx: unknown, text: string) => expect(findings.map((f) => f.message).join("\n")).toContain(text);

  type CheckScenario = { name: string; then: "exactly" | "none"; says?: number; anySays?: boolean; mermaid?: boolean };
  /** The scenarios of a check Rule: a fixture course validated, then its findings compared. */
  const checkScenarios =
    (scenarios: CheckScenario[]) =>
    ({
      RuleScenario
    }: {
      RuleScenario: (name: string, body: (steps: Record<"Given" | "When" | "Then" | "And", (text: string, fn: (...args: never[]) => unknown) => void>) => void) => void;
    }) => {
      for (const scenario of scenarios) {
        RuleScenario(scenario.name, ({ Given, When, Then, And }) => {
          Given("the {string} course of fixture {string}", givenFixture);
          if (scenario.mermaid) When("the course is validated with the reader's Mermaid", whenValidatedWithMermaid);
          else When("the course is validated", whenValidated);
          if (scenario.then === "none") Then("there shall be no findings", none);
          else Then("the findings shall be exactly {string}", exactly);
          if ((scenario.says ?? 0) > 0) And("the finding for {string} shall say {string}", says);
          if ((scenario.says ?? 0) > 1) And("the finding for {string} shall also say {string}", says);
          if (scenario.anySays) {
            And("a finding shall say {string}", anySays);
            And("another finding shall say {string}", anySays);
          }
        });
      }
    };

  Rule(
    "If a quiz page has no quiz block or a question the reader leaves out, then tutors shall report rule V013 against the page, naming each question left out and why.",
    checkScenarios([
      { name: "A question with no right answer and a quiz with no quiz block", then: "exactly", says: 2 },
      { name: "The same quizzes with every question complete", then: "none" }
    ])
  );
  Rule(
    "If a quiz page has a second quiz block or a time limit that is not a whole number of seconds, then tutors shall report rule V014 as a warning against the page.",
    checkScenarios([
      { name: "A time limit in words and a second quiz block", then: "exactly" },
      { name: "One quiz block timed in seconds", then: "none" }
    ])
  );
  Rule(
    "If a Talk's Marp deck has no marp true in its own front matter or its talk's, then tutors shall report rule V015 against the deck.",
    checkScenarios([
      { name: "A deck that names a theme but not marp true", then: "exactly", says: 1 },
      { name: "The same deck with marp true", then: "none" }
    ])
  );
  Rule(
    "If a Talk holds more than one Marp deck, a deck asks for a theme Tutors does not have, or a slide holds a script the reader removes, then tutors shall report rule V016 as a warning.",
    checkScenarios([
      { name: "Two decks, an unknown theme and a button with a click handler", then: "exactly", says: 1 },
      { name: "One deck on a built-in theme with no script", then: "none" }
    ])
  );
  Rule(
    "Where a shell supplies a diagram checker, tutors shall report rule V017 against each page or deck with a Mermaid diagram that does not draw, naming the line where Mermaid stopped.",
    checkScenarios([
      { name: "An unclosed bracket and a misspelt diagram type, checked with the reader's Mermaid", then: "exactly", anySays: true, mermaid: true },
      { name: "The same diagrams fixed", then: "none", mermaid: true },
      { name: "Without a diagram checker the broken diagrams are not reported", then: "none" }
    ])
  );

  const givenDraft = (_ctx: unknown, title: string, seconds: number) => {
    draft = { title, timeLimit: seconds, questions: [] };
  };
  const unescape = (text: string) => text.replace(/\\n/g, "\n");
  const whenWritten = () => {
    read = null;
    refused = null;
    try {
      read = parseQuizMarkdown(extractQuizBlock(writeQuizBlock(draft)).quizSource ?? "");
    } catch (error) {
      refused = error as QuizDraftError;
    }
  };

  Rule("When a quiz is written from a lecturer's draft, tutors shall write a quiz block that the reader reads back to the same questions.", ({ RuleScenario }) => {
    RuleScenario("Multiple choice with code in an answer, and true or false", ({ Given, And, When, Then }) => {
      Given("a draft quiz {string} timed at {int} seconds", givenDraft);
      And("a multiple-choice question {string} with answers {string}, {string} and {string}, the first right", (_ctx: unknown, text: string, a: string, b: string, c: string) => {
        draft.questions.push({ type: "multiple-choice", text, options: [a, unescape(b), c], correctIndex: 0 });
      });
      And("a true-or-false question {string} whose answer is false", (_ctx: unknown, text: string) => {
        draft.questions.push({ type: "true-false", text, options: [], correctIndex: 1 });
      });
      When("the quiz is written", whenWritten);
      Then("the reader reads back {int} questions titled {string} timed at {int} seconds", (_ctx: unknown, count: number, title: string, seconds: number) => {
        expect(read!.questions).toHaveLength(count);
        expect(read!.title).toBe(title);
        expect(read!.timeLimit).toBe(seconds);
        expect(read!.questions[0].options).toEqual(draft.questions[0].options);
        expect(read!.questions[0].text).toBe(draft.questions[0].text);
      });
      And("question {int} has the answers {string} and {string} with {string} right", (_ctx: unknown, number: number, first: string, second: string, right: string) => {
        const question = read!.questions[number - 1];
        expect(question.options).toEqual([first, second]);
        expect(question.options[question.correctIndex]).toBe(right);
      });
    });
  });

  Rule("If a lecturer's draft holds a question the reader cannot show as built, then tutors shall refuse to write the quiz and name the question and why.", ({ RuleScenario }) => {
    RuleScenario("A second question with only one answer", ({ Given, And, When, Then }) => {
      Given("a draft quiz {string} timed at {int} seconds", givenDraft);
      And("a multiple-choice question {string} with answers {string} and {string}, the first right", (_ctx: unknown, text: string, a: string, b: string) => {
        draft.questions.push({ type: "multiple-choice", text, options: [a, b], correctIndex: 0 });
      });
      And("a multiple-choice question {string} with the single answer {string}", (_ctx: unknown, text: string, only: string) => {
        draft.questions.push({ type: "multiple-choice", text, options: [only], correctIndex: 0 });
      });
      When("the quiz is written", whenWritten);
      Then("writing is refused for question {int} because {string}", (_ctx: unknown, number: number, problem: string) => {
        expect(read).toBeNull();
        expect(refused).toBeInstanceOf(QuizDraftError);
        expect(refused!.question).toBe(number);
        expect(refused!.problem).toBe(problem);
      });
    });
  });
});
