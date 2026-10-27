/**
 * Code blocks in quizzes (Rules 0669-0673): the reader's quiz splitter and parser, and the
 * renderer QuizQuestion uses for question and option text, over a recording code highlighter.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { extractQuizBlock, parseQuizMarkdown, type ParsedQuiz, type QuizContent } from "../../../../packages/svelte/quiz/src/index.ts";
import { convertMdToHtml, initHighlighter } from "@tutors/tutors-model-lib";
import { quizTextToHtml } from "../../../../packages/svelte/ui-components/src/quiz/quiz-text.ts";

const feature = await loadFeature("tests/bdd/features/student/quiz-code-blocks.feature");
const FIXTURES = join(import.meta.dirname, "../../../fixtures/quiz-code-blocks");

/** Gherkin strings carry `\n` literally; the markdown they stand for has real newlines. */
const unescape = (text: string) => text.replaceAll("\\n", "\n");
const block = (lang: string, code: string) => `\`\`\`${lang}\n${unescape(code)}\n\`\`\``;

describeFeature(feature, ({ Rule }) => {
  let source: string;
  let quiz: ParsedQuiz | null;
  let content: QuizContent;
  let theme = "ayu-dark";
  let html: string;
  const highlighted: { lang: string; theme: string }[] = [];

  const question = () => quiz!.questions[0];

  function givenQuestion(_ctx: unknown, file: string) {
    source = readFileSync(join(FIXTURES, file), "utf8");
  }
  function whenParsed() {
    quiz = parseQuizMarkdown(source);
  }
  function thenOneQuestion(_ctx: unknown, count: number) {
    expect(quiz?.questions).toHaveLength(count);
  }
  function thenTextWithBlock(_ctx: unknown, text: string, lang: string, code: string) {
    expect(question().text).toBe(`${text}\n\n${block(lang, code)}`);
  }

  Rule("The reader shall show a fenced code block written under a quiz question as part of that question.", ({ RuleScenario }) => {
    RuleScenario("A question carries a JavaScript snippet", ({ Given, When, Then, And }) => {
      Given("the quiz question in {string}", givenQuestion);
      When("the reader parses the quiz", whenParsed);
      Then("the question text shall be {string} followed by the {string} block {string}", thenTextWithBlock);
      And("the question shall have {number} options", (_ctx, count: number) => {
        expect(question().options).toHaveLength(count);
      });
    });

    RuleScenario("A one-line question reads as it always has", ({ Given, When, Then }) => {
      Given("the quiz question in {string}", givenQuestion);
      When("the reader parses the quiz", whenParsed);
      Then("the question text shall be {string}", (_ctx, text: string) => {
        expect(question().text).toBe(text);
      });
    });
  });

  Rule("The reader shall show a fenced code block indented under a quiz option as part of that option.", ({ RuleScenario }) => {
    RuleScenario("Each option is a snippet", ({ Given, When, Then, And }) => {
      Given("the quiz question in {string}", givenQuestion);
      When("the reader parses the quiz", whenParsed);
      Then("option {number} shall be the {string} block {string}", (_ctx, n: number, lang: string, code: string) => {
        expect(question().options[n - 1]).toBe(block(lang, code));
      });
      And("option {number} shall be the {string} block {string}", (_ctx, n: number, lang: string, code: string) => {
        expect(question().options[n - 1]).toBe(block(lang, code));
      });
      And("option {number} shall be {string}", (_ctx, n: number, text: string) => {
        expect(question().options).toHaveLength(n);
        expect(question().options[n - 1]).toBe(text);
      });
      And("the correct answer shall be option {number}", (_ctx, n: number) => {
        expect(question().correctIndex).toBe(n - 1);
      });
    });
  });

  Rule("If a code block in a quiz contains a line of three dashes or a field name, then the reader shall keep that line in the code block.", ({ RuleScenario }) => {
    RuleScenario("YAML front matter inside a question stays in the snippet", ({ Given, When, Then, And }) => {
      Given("the quiz question in {string}", givenQuestion);
      When("the reader parses the quiz", whenParsed);
      Then("the quiz shall have {number} question", thenOneQuestion);
      And("the question text shall be {string} followed by the {string} block {string}", (ctx, text: string, lang: string, code: string) => {
        thenTextWithBlock(ctx, text, lang, code);
        expect(question().options).toEqual(["title", "type"]);
      });
    });
  });

  Rule("The reader shall render a code block in a quiz question or option with the syntax highlighting and code theme used for lab steps.", ({ RuleScenario }) => {
    /** Stands in for Shiki: records each request and returns markup naming it. */
    initHighlighter({
      codeToHtml: (code: string, options: { lang: string; theme: string }) => {
        highlighted.push({ lang: options.lang, theme: options.theme });
        return `<pre class="shiki ${options.theme}" data-lang="${options.lang}"><code>${code}</code></pre>`;
      }
    });

    RuleScenario("A quiz snippet renders like a lab snippet", ({ Given, When, Then, And }) => {
      let markdown: string;
      Given("the code theme is {string}", (_ctx, name: string) => {
        theme = name;
      });
      When("the reader renders the quiz text {string}", (_ctx, text: string) => {
        markdown = unescape(text);
        highlighted.length = 0;
        html = quizTextToHtml(markdown, theme);
      });
      Then("the code block shall be highlighted as {string} in the theme {string}", (_ctx, lang: string, name: string) => {
        expect(highlighted).toEqual([{ lang, theme: name }]);
        expect(html).toContain(`data-lang="${lang}"`);
      });
      And("the rendered code block shall match a lab step rendering the same markdown", () => {
        const pre = (markup: string) => markup.slice(markup.indexOf("<pre"), markup.indexOf("</pre>") + 6);
        expect(pre(html)).toBe(pre(convertMdToHtml(markdown, theme)));
      });
    });

    RuleScenario("One-line quiz text stays inline", ({ When, Then }) => {
      When("the reader renders the quiz text {string}", (_ctx, text: string) => {
        highlighted.length = 0;
        html = quizTextToHtml(unescape(text), theme);
      });
      Then("the rendered text shall be {string} with no paragraph or code block", (_ctx, expected: string) => {
        expect(html).toBe(expected);
        expect(highlighted).toEqual([]);
      });
    });
  });

  Rule(
    "If a quiz fence opened with three backticks contains a code fence that names its language, then the reader shall keep that code fence inside the quiz.",
    ({ RuleScenario }) => {
      RuleScenario("A three-backtick quiz with a nested snippet", ({ Given, When, Then, And }) => {
        Given("the quiz learning object in {string}", givenQuestion);
        When("the reader splits the quiz from its prose", () => {
          content = extractQuizBlock(source);
          quiz = content.quizSource === null ? null : parseQuizMarkdown(content.quizSource);
        });
        Then("the prose shall be {string}", (_ctx, prose: string) => {
          // Lifting the quiz out leaves its blank lines behind; markdown reads any run of them as one.
          expect(content.prose.replace(/\n{3,}/g, "\n\n")).toBe(unescape(prose));
        });
        And("the quiz shall have {number} question", (ctx, count: number) => {
          thenOneQuestion(ctx, count);
          expect(question().text).toBe(`What does this print?\n\n${block("js", "console.log([1, 2].length);")}`);
        });
      });
    }
  );
});
