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
    for (const diagnosis of diagnoseQuiz(await read(page.path))) {
      if (diagnosis.kind === "no-block") findings.push(found("V013", page.path, messages.quizNoBlock()));
      else if (diagnosis.kind === "empty-block") findings.push(found("V013", page.path, messages.quizEmpty()));
      else if (diagnosis.kind === "question") {
        const { number, excerpt, problem, optionCount, answer } = diagnosis;
        findings.push(found("V013", page.path, messages.quizQuestion(number, excerpt, problem, optionCount, answer)));
      } else if (diagnosis.kind === "second-block") findings.push(found("V014", page.path, messages.quizSecondBlock()));
      else findings.push(found("V014", page.path, messages.quizTimeLimit(diagnosis.value)));
    }
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
/** What the reader's sanitiser strips from a slide (rule 0645): scripts, on...= handlers inside a tag, javascript: URLs. */
const STRIPPED = [/<script\b/i, /<[^>]*\son[a-z]+\s*=/i, /javascript:/i];

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
      const matter = frontMatterOf(text);
      if (!isTrue(matter.marp) && !isTrue(talkMatter.marp)) findings.push(found("V015", deck.path, messages.marpNotSlides(deck.name)));
      const theme = matter.theme ?? talkMatter.theme;
      if (theme != null && !MARP_THEMES.includes(String(theme))) findings.push(found("V016", deck.path, messages.marpTheme(deck.name, String(theme))));
      const body = text.replace(FRONT_MATTER, "");
      body.split(/^---$/m).forEach((slide, index) => {
        if (STRIPPED.some((pattern) => pattern.test(slide))) findings.push(found("V016", deck.path, messages.marpScript(deck.name, index + 1)));
      });
    }
  }
  return findings;
}

const MERMAID_OPEN = /^\s*(`{3,}|~{3,})\s*mermaid\s*$/i;

/** Each fenced mermaid block in a text: its source and the file line (1-based) its first line is on. */
export function mermaidBlocks(text: string): { source: string; line: number }[] {
  const blocks: { source: string; line: number }[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let at = 0; at < lines.length; at++) {
    const open = MERMAID_OPEN.exec(lines[at]);
    if (open === null) continue;
    const fence = open[1];
    const body: string[] = [];
    let end = at + 1;
    while (end < lines.length && !(lines[end].trim().startsWith(fence[0].repeat(fence.length)) && lines[end].trim().replaceAll(fence[0], "") === "")) body.push(lines[end++]);
    blocks.push({ source: body.join("\n"), line: at + 2 });
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
