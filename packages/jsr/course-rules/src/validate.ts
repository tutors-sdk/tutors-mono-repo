import yaml from "js-yaml";
import type { FileOp, Finding, RuleId } from "./finding.ts";
import { severityOf } from "./finding.ts";
import { messages } from "./messages.ts";
import type { FileSystemPort, ValidateOptions } from "./ports.ts";
import { joinPath, readText } from "./ports.ts";
import { checkDiagrams, checkMarp, checkQuizzes } from "./rich.ts";
import type { CourseNode, CourseTree } from "./tree.ts";
import { buildCourseTree, extensionOf, holdsCourseMaterial, holdsOnlyImages, kindOf } from "./tree.ts";
import { checkEmpty, checkImages, checkNames, checkNetlify, checkTitles, checkTopicNumbers, slugify } from "./warnings.ts";

const compositeKinds = ["unit", "side", "topic"];
const STEP = /^(\d{2})\.[^.].*\.md$/;

export { slugify };

function finding(rule: RuleId, path: string, message: string, suggestedName?: string, fix?: FileOp): Finding {
  const base: Finding = { rule, severity: severityOf(rule), path, message };
  if (suggestedName !== undefined) base.suggestedName = suggestedName;
  if (fix !== undefined) base.fix = fix;
  return base;
}

const severityRank = { error: 0, warn: 1, info: 2 } as const;

/** Errors first, then by path, then by rule, so every shell lists findings in one order. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0)
  );
}

/**
 * Checks a course folder and reports every problem with the file or folder at fault. Reads through the
 * port and never writes. `root` is the course folder as the port addresses it ("" when the port is
 * already rooted at the course). `options.diagrams` checks Mermaid diagrams (V017) when the shell has
 * Mermaid to hand; without it that rule does not run.
 */
export async function validate(fs: FileSystemPort, root = "", options: ValidateOptions = {}): Promise<Finding[]> {
  const tree = await buildCourseTree(fs, root);
  const read = (path: string) => readText(fs, joinPath(root, path));
  return sortFindings([
    ...checkTree(tree),
    ...(await checkLinks(tree, read)),
    ...(await checkYaml(tree, read)),
    ...(await checkNames(tree, read)),
    ...(await checkTitles(tree, read)),
    ...(await checkImages(tree, read)),
    ...checkTopicNumbers(tree),
    ...(await checkNetlify(tree, read)),
    ...checkEmpty(tree),
    ...(await checkQuizzes(tree, read)),
    ...(await checkMarp(tree, read)),
    ...(await checkDiagrams(tree, read, options.diagrams))
  ]);
}

/** The structural error rules, V001-V004: everything that needs only names, not file contents. */
export function checkTree(tree: CourseTree): Finding[] {
  const findings: Finding[] = [];
  if (!tree.files.some((file) => file.name === "course.md")) findings.push(finding("V001", "", messages.V001()));
  walk(tree, findings);
  return findings;
}

function walk(node: CourseNode, findings: Finding[]): void {
  // Inside a lab, note, talk or other single learning object, a folder of no kind is that object's
  // resource folder: the generator types it as its parent and publishes its files (lab assets/, img/).
  const holdsResources = node.kind !== "course" && !compositeKinds.includes(node.kind ?? "");
  for (const child of node.children) {
    if (child.kind === null) {
      if (holdsResources || holdsOnlyImages(child)) continue;
      // A name that only needs tidying to start with a kind ("-talk-01", "Talk 01") keeps that kind; anything else becomes a topic.
      const slug = slugify(child.name);
      const suggestion = kindOf(slug) !== null ? slug : ["course", "unit", "side"].includes(node.kind ?? "") ? `topic-${slug}` : undefined;
      if (holdsCourseMaterial(child)) {
        const fix: FileOp | undefined = suggestion === undefined ? undefined : { op: "move", from: child.path, to: joinPath(node.path, suggestion) };
        findings.push(finding("V002", child.path, messages.V002(child.name, suggestion), suggestion, fix));
      } else {
        // Working files the lecturer keeps beside the course; renaming is their call, so no fix is offered.
        findings.push(finding("V018", child.path, messages.V018(child.name, suggestion)));
      }
      continue;
    }
    checkFolder(child, findings);
    walk(child, findings);
  }
}

const filesWith = (node: CourseNode, ...extensions: string[]) => node.files.filter((file) => extensions.includes(extensionOf(file.name))).map((file) => file.name);

function checkFolder(node: CourseNode, findings: Finding[]): void {
  const kind = node.kind!;
  const md = filesWith(node, "md");
  if (compositeKinds.includes(kind)) {
    if (md.length === 0) findings.push(finding("V003", node.path, messages.V003(kind)));
    return;
  }
  if (kind === "talk" || kind === "paneltalk") {
    const pdfs = filesWith(node, "pdf");
    if (md.length === 0) findings.push(finding("V004", node.path, messages.talkMissingDescriptor()));
    if (pdfs.length > 1) findings.push(finding("V004", node.path, messages.talkTwoPdfs(pdfs)));
    else if (pdfs.length === 0 && filesWith(node, "marp").length === 0 && !node.files.some((file) => file.name === "videoid")) {
      findings.push(finding("V004", node.path, messages.talkNoSlides()));
    }
  } else if (kind === "note" || kind === "panelnote") {
    if (md.length === 0) findings.push(finding("V004", node.path, messages.noteMissing()));
    else if (md.length > 1) findings.push(finding("V004", node.path, messages.noteTwoFiles(md)));
  } else if (kind === "lab") {
    checkLab(node, md, findings);
  }
}

function checkLab(node: CourseNode, md: string[], findings: Finding[]): void {
  if (md.length === 0) {
    findings.push(finding("V004", node.path, messages.labNoSteps()));
    return;
  }
  const numbers: number[] = [];
  for (const file of md) {
    const match = STEP.exec(file);
    if (match === null) findings.push(finding("V004", joinPath(node.path, file), messages.labStepName(file)));
    else numbers.push(Number(match[1]));
  }
  if (numbers.length === 0) return;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (numbers[0] > 1) {
    findings.push(finding("V019", node.path, messages.labFirstStep(pad(numbers[0]))));
    return;
  }
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] > numbers[i - 1] + 1) {
      findings.push(finding("V019", node.path, messages.labStepOrder(pad(numbers[i - 1] + 1), pad(numbers[i]))));
      return;
    }
  }
}

const linkFiles: Record<string, { file: string; valid: (line: string) => boolean }> = {
  web: { file: "weburl", valid: (line) => /^https?:\/\/\S+$/.test(line) || /^\/(?!\/)\S+$/.test(line) },
  github: { file: "githubid", valid: (line) => /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/.test(line) || /^[\w.-]+\/[\w.-]+$/.test(line) }
};

/** V005: a Web or GitHub link's file exists and its first line is the address. */
async function checkLinks(node: CourseNode, read: (path: string) => Promise<string>): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const child of node.children) {
    if (child.kind === null) continue;
    const link = linkFiles[child.kind];
    if (link) {
      const file = child.files.find((candidate) => candidate.name === link.file);
      if (!file) findings.push(finding("V005", child.path, messages.linkMissing(child.kind, link.file)));
      else if (!link.valid((await read(file.path)).split(/\r?\n/)[0].trim())) findings.push(finding("V005", file.path, messages.linkEmpty(child.kind, link.file)));
    }
    findings.push(...(await checkLinks(child, read)));
  }
  return findings;
}

interface YamlError {
  reason: string;
  mark: { line: number };
}
const isYamlError = (error: unknown): error is YamlError =>
  typeof error === "object" && error !== null && typeof (error as YamlError).reason === "string" && typeof (error as YamlError).mark?.line === "number";

type Shape = { expected: string; ok: (value: unknown) => boolean };
const isMap = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const emptyOrMap = (value: unknown) => value === null || value === undefined || isMap(value);
/** A calendar week as the reader reads it: `- date: ...` (with week, topic, assessment), or the older `- 2026-09-07: {title, type}`. */
const isWeek = (week: unknown) => {
  if (!isMap(week)) return false;
  if (week.date !== undefined && week.date !== null) return true;
  const keys = Object.keys(week);
  return keys.length === 1 && isMap(week[keys[0]]);
};
const isText = (item: unknown) => typeof item === "string";
const isStudent = (item: unknown) => isMap(item) && typeof item.name === "string" && typeof item.id === "string";
const yamlShapes: Record<string, Shape> = {
  "properties.yaml": { expected: "a list of name: value lines", ok: emptyOrMap },
  "calendar.yaml": {
    expected: "a title and a list of weeks (weeks:, then one - date: line per week)",
    ok: (value) => isMap(value) && Array.isArray(value.weeks) && value.weeks.every(isWeek)
  },
  "enrollment.yaml": { expected: "lists named educators and whitelist (GitHub logins) or students (each a name and an id), or nothing at all", ok: emptyOrMap },
  "badges.yaml": { expected: "a list of name: value lines", ok: emptyOrMap }
};

/** The same metadata checks apply to source YAML and the values published in tutors.json. */
export function checkMetadata(file: string, value: unknown): Finding[] {
  if (file === "enrollment.yaml" && isMap(value)) {
    const findings: Finding[] = [];
    const report = (field: string, detail: string) => findings.push(finding("V006", file, `${file}: ${field} ${detail}`));
    if ("enrollment" in value) report("enrollment", "is nested inside another enrollment block. Start the file with educators:, whitelist:, or students: directly.");
    for (const field of ["educators", "whitelist", "students"]) {
      const list = value[field];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        report(field, "must be a list. Use [] for an empty list, or remove the field when it is unused.");
        continue;
      }
      list.forEach((entry, index) => {
        if (field === "students") {
          if (!isStudent(entry)) report(`${field}[${index}]`, "must contain both name and id as text. For example: {name: Alice, id: alice}. Use id for the GitHub login, not github.");
        } else if (!isText(entry)) report(`${field}[${index}]`, "must be a GitHub login written as text. Quote a numeric-looking login.");
      });
    }
    return findings;
  }
  const shape = yamlShapes[file];
  return shape && !shape.ok(value) ? [finding("V006", file, messages.yamlShape(file, shape.expected))] : [];
}

/** V006: the course-root YAML files parse and have the shape the generator reads. */
async function checkYaml(tree: CourseTree, read: (path: string) => Promise<string>): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const file of tree.files) {
    const shape = yamlShapes[file.name];
    if (!shape) continue;
    let value: unknown;
    try {
      value = yaml.load(await read(file.path));
    } catch (error: unknown) {
      const detail = isYamlError(error) ? `line ${error.mark.line + 1}, ${error.reason}` : String(error);
      findings.push(finding("V006", file.path, messages.yamlBroken(file.name, detail)));
      continue;
    }
    findings.push(...checkMetadata(file.name, value));
  }
  return findings;
}
