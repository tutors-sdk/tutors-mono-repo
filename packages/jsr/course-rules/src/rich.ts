import yaml from "js-yaml";
import type { Finding, RuleId } from "./finding.ts";
import { severityOf } from "./finding.ts";
import { messages } from "./messages.ts";
import type { DiagramPort } from "./ports.ts";
import { diagnoseQuiz } from "./quiz/diagnose.ts";
import type { CourseNode, CourseTree } from "./tree.ts";
import { extensionOf } from "./tree.ts";
import { typedNodes } from "./warnings.ts";

/**
 * The rich-content rules, V013-V017: quizzes, Marp decks and Mermaid diagrams. Each reads files the way
 * the reader and the generator do and names what students would not see as the lecturer wrote it.
 */

type Read = (path: string) => Promise<string>;

const found = (rule: RuleId, path: string, message: string): Finding => ({ rule, severity: severityOf(rule), path, message });
const filesWith = (node: CourseNode, extension: string) => node.files.filter((file) => extensionOf(file.name) === extension);

/** V013 and V014: every quiz learning object's questions, as the reader would show them. */
export async function checkQuizzes(tree: CourseTree, read: Read): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const node of typedNodes(tree).filter((candidate) => candidate.kind === "quiz")) {
    const [page] = filesWith(node, "md");
    if (page === undefined) {
      findings.push(found("V013", node.path, messages.quizNoFile()));
      continue;
    }
    findings.push(...checkQuizText(await read(page.path), page.path));
  }
  return findings;
}

/** Quiz content has the same meaning in a source file and in a published learning object. */
export function checkQuizText(text: string, path: string): Finding[] {
  const findings: Finding[] = [];
  for (const diagnosis of diagnoseQuiz(text)) {
    if (diagnosis.kind === "no-block") findings.push(found("V013", path, messages.quizNoBlock()));
    else if (diagnosis.kind === "empty-block") findings.push(found("V013", path, messages.quizEmpty()));
    else if (diagnosis.kind === "question") {
      const { number, excerpt, problem, optionCount, answer } = diagnosis;
      findings.push(found("V013", path, messages.quizQuestion(number, excerpt, problem, optionCount, answer)));
    } else if (diagnosis.kind === "second-block") findings.push(found("V014", path, messages.quizSecondBlock()));
    else findings.push(found("V014", path, messages.quizTimeLimit(diagnosis.value)));
  }
  return findings;
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** A file's leading YAML front matter, as the generator reads it; empty when there is none or it doesn't parse. */
export function frontMatterOf(text: string): Record<string, unknown> {
  const match = FRONT_MATTER.exec(text);
  if (match === null) return {};
  try {
    const value = yaml.load(match[1]);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const isTrue = (value: unknown) => value != null && String(value).toLowerCase() === "true";
const MARP_THEMES = ["default", "gaia", "uncover"];
/**
 * What the reader's sanitiser strips from a slide (rule 0645): scripts, on...= handlers inside a tag, and
 * javascript: URLs as a link's target or an attribute's value. "JavaScript: behaviour" in prose is not one, nor is "Frontend = JavaScript: behaviour" outside a tag.
 */
const STRIPPED = [/<script\b/i, /<[^>]*\son[a-z]+\s*=/i, /\]\(<?\s*javascript:/i, /<[^>]*=\s*["']?\s*javascript:/i];

const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;

/** A slide's text with fenced and inline code removed: Marp escapes code, so the sanitiser never sees it as markup. */
export function withoutCode(slide: string): string {
  const kept: string[] = [];
  let fence: string | undefined;
  for (const line of slide.split("\n")) {
    const marker = FENCE_OPEN.exec(line)?.[1];
    if (fence === undefined && marker !== undefined) fence = marker;
    else if (fence !== undefined && closes(line, fence)) fence = undefined;
    else if (fence === undefined) kept.push(line);
  }
  return withoutInlineCode(kept.join("\n"));
}

/** Text with each inline code span (a run of backticks up to the next run of the same length) removed. */
function withoutInlineCode(text: string): string {
  let out = "";
  let at = 0;
  while (at < text.length) {
    if (text[at] !== "`") {
      out += text[at++];
      continue;
    }
    let after = at;
    while (text[after] === "`") after++;
    const close = closingRun(text, after, after - at);
    if (close === -1) out += text.slice(at, after);
    at = close === -1 ? after : close + (after - at);
  }
  return out;
}

/** Where the next run of exactly `length` backticks starts at or after `from`; -1 when there is none. */
function closingRun(text: string, from: number, length: number): number {
  for (let at = text.indexOf("`", from); at !== -1;) {
    let end = at;
    while (text[end] === "`") end++;
    if (end - at === length) return at;
    at = text.indexOf("`", end);
  }
  return -1;
}

/** Whether a line closes a fence opened with the given marker: the same character, at least as many, nothing else. */
const closes = (line: string, fence: string) => {
  const trimmed = line.trim();
  return trimmed.length >= fence.length && trimmed === fence[0].repeat(trimmed.length);
};

/** V015 and V016: each Talk's Marp decks, read the way gen's talk builder and Marp renderer read them. */
export async function checkMarp(tree: CourseTree, read: Read): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const node of typedNodes(tree).filter((candidate) => candidate.kind === "talk" || candidate.kind === "paneltalk")) {
    const decks = filesWith(node, "marp");
    if (decks.length === 0) continue;
    if (decks.length > 1) findings.push(found("V016", node.path, messages.marpTwoDecks(decks.map((deck) => deck.name))));
    const pages = filesWith(node, "md");
    const talkMatter = pages.length > 0 ? frontMatterOf(await read(pages[0].path)) : {};
    for (const deck of decks) {
      const text = (await read(deck.path)).replace(/\r\n?/g, "\n");
      // gen's buildTalk spreads the deck's front matter first, so the talk page's values win.
      const matter = { ...frontMatterOf(text), ...talkMatter };
      if (!isTrue(matter.marp)) findings.push(found("V015", deck.path, messages.marpNotSlides(deck.name)));
      const theme = matter.theme;
      if (theme != null && !MARP_THEMES.includes(String(theme))) findings.push(found("V016", deck.path, messages.marpTheme(deck.name, String(theme))));
      const body = text.replace(FRONT_MATTER, "");
      body.split(/^---$/m).forEach((slide, index) => {
        const prose = withoutCode(slide);
        if (STRIPPED.some((pattern) => pattern.test(prose))) findings.push(found("V016", deck.path, messages.marpScript(deck.name, index + 1)));
      });
    }
  }
  return findings;
}

/** Each fenced mermaid block in a text: its source and the file line (1-based) its first line is on. */
export function mermaidBlocks(text: string): { source: string; line: number }[] {
  const blocks: { source: string; line: number }[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let at = 0; at < lines.length; at++) {
    const open = FENCE_OPEN.exec(lines[at]);
    if (open === null) continue;
    const fence = open[1];
    const body: string[] = [];
    let end = at + 1;
    while (end < lines.length && !closes(lines[end], fence)) body.push(lines[end++]);
    // Any other fence is code, so a mermaid fence inside it is an example, not a diagram the reader draws.
    if (/^\s*mermaid\s*$/i.test(lines[at].trim().slice(fence.length))) blocks.push({ source: body.join("\n"), line: at + 2 });
    at = end;
  }
  return blocks;
}

/** V017: every Mermaid diagram in a page or deck draws, checked by the shell's DiagramPort. */
export async function checkDiagrams(tree: CourseTree, read: Read, diagrams: DiagramPort | undefined): Promise<Finding[]> {
  if (diagrams === undefined) return [];
  const findings: Finding[] = [];
  for (const node of typedNodes(tree)) {
    for (const file of node.files.filter((candidate) => ["md", "marp"].includes(extensionOf(candidate.name)))) {
      for (const block of mermaidBlocks(await read(file.path))) {
        if (block.source.trim() === "") continue;
        const check = await diagrams.mermaid(block.source);
        if (check.draws !== false) continue;
        const lines = block.source.split("\n");
        if (check.unknownType) {
          const first = lines.find((line) => line.trim() !== "")!.trim();
          findings.push(found("V017", file.path, messages.diagramUnknown(file.name, block.line, first)));
        } else {
          const text = check.line === undefined ? "" : (lines[check.line - 1] ?? "").trim();
          findings.push(found("V017", file.path, messages.diagramBroken(file.name, block.line, check.line, text)));
        }
      }
    }
  }
  return findings;
}
