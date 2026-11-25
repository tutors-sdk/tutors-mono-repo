import { fileSlug, type ShapeItem, type ShapeProposal } from "@tutors/course-rules";
import { courseRootFiles } from "./generate.ts";
import { patternCalendarYaml, type GeneratedFile } from "./pattern-course.ts";
import { WEEKS_PER_UNIT } from "./patterns.ts";
import { topicIcons } from "./templates.ts";
import { padNumber, type CourseSpec } from "./types.ts";

/** A lecturer's file copied into the new course: `from` is relative to the imported folder, `to` to the course. */
interface FileCopy {
  from: string;
  to: string;
}

export interface ImportLayout {
  /** Files written fresh: the course root files, units, topics and each item's descriptor. */
  files: GeneratedFile[];
  /** The lecturer's own files, each copied once into the item it belongs to. */
  copies: FileCopy[];
}

export interface ImportOptions {
  /** The Monday teaching starts, YYYY-MM-DD; when given, a calendar.yaml dates each week. */
  start?: string;
}

const icons: Record<ShapeItem["kind"], string> = {
  talk: "fluent-color:slide-text-sparkle-24",
  note: "fluent-color:notebook-24",
  lab: "fluent-color:code-24",
  archive: "fluent-color:folder-24",
  web: "fluent-color:link-24"
};

const card = (title: string, icon: string, body = "") => `---\nicon:\n  type: ${icon}\n---\n\n# ${title}\n${body ? `\n${body}\n` : ""}`;
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const LAB_STEP = /^(\d{1,2})[\s._-]+/;

/** A lab's steps renamed as Tutors reads them (00.Setup.md, 01.Install.md, ...), numbered in sequence from the source's first number (0 or 1). */
function labCopies(item: ShapeItem, dir: string): FileCopy[] {
  const steps = item.files.filter((path) => LAB_STEP.test(baseName(path)) && path.toLowerCase().endsWith(".md"));
  const first = Number(LAB_STEP.exec(baseName(steps[0]))![1]) === 0 ? 0 : 1;
  const folder = steps[0].slice(0, steps[0].lastIndexOf("/") + 1);
  const copies = steps.map((path, i) => {
    const rest = fileSlug(
      baseName(path)
        .replace(/\.md$/i, "")
        .replace(/^\d{1,2}(?:[\s._-]+|$)/, "")
    );
    return { from: path, to: `${dir}/${padNumber(first + i)}.${rest === "file" ? `Step-${padNumber(first + i)}` : rest}.md` };
  });
  // Anything else in the lab's folder (its img/ folder, say) keeps its place relative to the steps, so their links still work.
  const others = item.files.filter((path) => !steps.includes(path)).map((path) => ({ from: path, to: `${dir}/${path.slice(folder.length)}` }));
  return [...copies, ...others];
}

/** One item's files: what is written for it and what is copied into it. */
function itemLayout(item: ShapeItem, dir: string): ImportLayout {
  const source = item.files[0];
  const copied = { from: source, to: `${dir}/${fileSlug(baseName(source))}` };
  switch (item.kind) {
    case "talk":
      return { files: [{ relativePath: `${dir}/talk.md`, content: card(item.title, icons.talk) }], copies: [copied] };
    case "note":
      if (source.toLowerCase().endsWith(".md")) return { files: [], copies: [{ from: source, to: `${dir}/note.md` }] };
      return { files: [{ relativePath: `${dir}/note.md`, content: card(item.title, icons.note, `[Download ${item.title}](${baseName(copied.to)})`) }], copies: [copied] };
    case "archive":
      return { files: [{ relativePath: `${dir}/archive.md`, content: card(item.title, icons.archive) }], copies: [copied] };
    case "web":
      return {
        files: [
          { relativePath: `${dir}/web.md`, content: card(item.title, icons.web) },
          { relativePath: `${dir}/weburl`, content: `${item.url}\n` }
        ],
        copies: []
      };
    case "lab":
      return { files: [], copies: labCopies(item, dir) };
  }
}

/**
 * Lays out an accepted proposal as a course: the usual root files, one topic for every week up to the
 * last one with material (an empty week stays as an empty topic, so the course map and the calendar
 * agree), grouped four weeks to a unit, and each item in its own numbered folder. Pure.
 */
export function importLayout(spec: CourseSpec, proposal: ShapeProposal, options: ImportOptions = {}): ImportLayout {
  const layout: ImportLayout = { files: courseRootFiles(spec), copies: [] };
  const lastWeek = Math.max(0, ...proposal.topics.map((topic) => topic.week));
  if (lastWeek === 0) return layout;
  if (options.start !== undefined) {
    layout.files.push({ relativePath: "calendar.yaml", content: patternCalendarYaml(spec, { id: "imported", weeks: lastWeek, start: options.start }) });
  }
  for (let week = 1; week <= lastWeek; week++) {
    const unit = Math.ceil(week / WEEKS_PER_UNIT);
    const unitDir = `unit-${unit}`;
    if ((week - 1) % WEEKS_PER_UNIT === 0) {
      const last = Math.min(unit * WEEKS_PER_UNIT, lastWeek);
      const span = last === week ? `Week ${week}` : `Weeks ${week}–${last}`;
      layout.files.push({ relativePath: `${unitDir}/unit.md`, content: `# ${span}\n` });
    }
    const topicDir = `${unitDir}/topic-${padNumber(week)}`;
    layout.files.push({ relativePath: `${topicDir}/topic.md`, content: card(`Week ${week}`, topicIcons[(week - 1) % topicIcons.length]) });
    const counts: Record<string, number> = {};
    for (const item of proposal.topics.find((topic) => topic.week === week)?.items ?? []) {
      counts[item.kind] = (counts[item.kind] ?? 0) + 1;
      const part = itemLayout(item, `${topicDir}/${item.kind}-${padNumber(counts[item.kind])}`);
      layout.files.push(...part.files);
      layout.copies.push(...part.copies);
    }
  }
  return layout;
}
