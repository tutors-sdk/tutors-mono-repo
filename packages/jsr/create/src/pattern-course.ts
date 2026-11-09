import type { CourseSpec, PatternChoice } from "./types.ts";
import { padNumber, LAB_STEP_COUNT } from "./types.ts";
import { patternById, WEEKS_PER_UNIT, type PatternItem } from "./patterns.ts";
import { labSetupMd, labStepMd, talkMarp, topicIcons, yamlText } from "./templates.ts";

export interface GeneratedFile {
  relativePath: string;
  content: string;
}

/** One teaching week: its number and the Monday it starts. A reading week has no number and no topic. */
export interface TeachingWeek {
  week: number;
  date: string;
}

const MS_PER_DAY = 86_400_000;

/** Parses YYYY-MM-DD as a UTC date, so the calendar is the same in every time zone. */
function parseDate(text: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`"${text}" is not a date like 2027-01-25`);
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(time).toISOString().slice(0, 10) !== text) throw new Error(`"${text}" is not a real date`);
  return time;
}

const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * The calendar's backbone: each teaching week dated a week apart from the start, with the reading week (if
 * any) taking the slot after week `readingWeek` and pushing the rest back a week.
 */
export function teachingWeeks(choice: PatternChoice): { weeks: TeachingWeek[]; readingWeekDate: string | null } {
  const start = parseDate(choice.start);
  const weeks: TeachingWeek[] = [];
  let readingWeekDate: string | null = null;
  let slot = 0;
  for (let week = 1; week <= choice.weeks; week++) {
    weeks.push({ week, date: iso(start + slot * 7 * MS_PER_DAY) });
    slot++;
    if (choice.readingWeek === week) {
      readingWeekDate = iso(start + slot * 7 * MS_PER_DAY);
      slot++;
    }
  }
  return { weeks, readingWeekDate };
}

const title = (item: PatternItem, week: number) => item.title.replace("{n}", String(week));
const md = (heading: string, summary: string, icon: string, body = "") => `---\nicon:\n  type: ${icon}\n---\n\n# ${heading}\n\n${summary}\n${body ? `\n${body}\n` : ""}`;

function itemFiles(dir: string, item: PatternItem, week: number): GeneratedFile[] {
  const heading = title(item, week);
  switch (item.kind) {
    case "talk":
      return [
        { relativePath: `${dir}/talk.md`, content: md(heading, "Summary of this talk (appears on the talk card).", "fluent-color:slide-text-sparkle-24") },
        { relativePath: `${dir}/talk.marp`, content: talkMarp(week) }
      ];
    case "note":
      return [{ relativePath: `${dir}/note.md`, content: md(heading, "Summary of this note (appears on the note card).", "fluent-color:notebook-24", "Write the note here.") }];
    case "lab": {
      const files = [{ relativePath: `${dir}/00.Setup.md`, content: labSetupMd(heading) }];
      for (let s = 1; s <= LAB_STEP_COUNT; s++) files.push({ relativePath: `${dir}/${padNumber(s)}.Step-${padNumber(s)}.md`, content: labStepMd(s, LAB_STEP_COUNT) });
      return files;
    }
    case "archive":
      return [
        {
          relativePath: `${dir}/archive.md`,
          content: md(
            heading,
            "Download the starter code for the project.",
            "fluent-color:folder-24",
            "Put the starter code's .zip in this folder; students download it from this card."
          )
        }
      ];
  }
}

/** Folder names for a topic's items: talk-01, lab-01, note-01, note-02 ... numbered per kind. */
function itemDirs(items: PatternItem[], parent: string): string[] {
  const counts: Record<string, number> = {};
  return items.map((item) => {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1;
    return `${parent}/${item.kind}-${padNumber(counts[item.kind])}`;
  });
}

export function patternCalendarYaml(spec: CourseSpec, choice: PatternChoice): string {
  const { weeks, readingWeekDate } = teachingWeeks(choice);
  const lines = [`title: ${yamlText(`${spec.courseName} Calendar`)}`, `year: ${weeks[0].date.slice(0, 4)}`, `weeks:`];
  for (const { week, date } of weeks) {
    lines.push(`  - date: ${date}`, `    week: ${week}`, `    topic: Week ${week}`);
    if (week === choice.readingWeek && readingWeekDate) lines.push(`  - date: ${readingWeekDate}`, `    topic: Reading Week`);
  }
  return lines.join("\n") + "\n";
}

const longDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The weekly topics and side unit for a pattern: one topic per teaching week, grouped four to a unit, each
 * holding what the pattern names. Pure: the same spec always gives the same files.
 */
export function patternFiles(spec: CourseSpec, choice: PatternChoice): GeneratedFile[] {
  const pattern = patternById(choice.id);
  if (!pattern) throw new Error(`Unknown pattern "${choice.id}"`);
  const files: GeneratedFile[] = [];
  files.push({ relativePath: "calendar.yaml", content: patternCalendarYaml(spec, choice) });

  files.push({ relativePath: "side/side.md", content: "Module\n\nThe handbook and everything that spans the whole module.\n" });
  itemDirs(pattern.side, "side").forEach((dir, i) => files.push(...itemFiles(dir, pattern.side[i], 1)));

  const { weeks } = teachingWeeks(choice);
  for (let first = 0; first < weeks.length; first += WEEKS_PER_UNIT) {
    const group = weeks.slice(first, first + WEEKS_PER_UNIT);
    const unitDir = `unit-${first / WEEKS_PER_UNIT + 1}`;
    const span = group.length === 1 ? `Week ${group[0].week}` : `Weeks ${group[0].week}–${group[group.length - 1].week}`;
    files.push({ relativePath: `${unitDir}/unit.md`, content: `${span}\n\n${pattern.name}, ${span.toLowerCase()}.\n` });
    for (const { week, date } of group) {
      const topicDir = `${unitDir}/topic-${padNumber(week)}`;
      files.push({
        relativePath: `${topicDir}/topic.md`,
        content: md(`Week ${week}`, `Week of ${longDate(date)}.`, topicIcons[(week - 1) % topicIcons.length])
      });
      itemDirs(pattern.week, topicDir).forEach((dir, i) => files.push(...itemFiles(dir, pattern.week[i], week)));
    }
  }
  return files;
}
