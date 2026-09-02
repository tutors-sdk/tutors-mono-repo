import type { CourseSpec } from "./types.ts";

export function courseMd(spec: CourseSpec): string {
  return `# ${spec.courseName}

${spec.lecturerName ? `By ${spec.lecturerName}. ` : ""}A short summary of your course goes here (this line appears on course cards).

Welcome to ${spec.courseName}! Describe what students will learn,
any prerequisites, and how the course is structured.
`;
}

export function propertiesYaml(spec: CourseSpec): string {
  // `credits` holds the author name and renders as the course subtitle. It is
  // populated when a name was given, otherwise left as a commented example.
  const creditsLine = spec.lecturerName ? `credits: ${spec.lecturerName}` : `# credits: Your Name`;

  return `# Course properties. Full reference:
#   https://tutors.dev/note/tutors-reference-manual/unit-1-getting-started/note-d-properties

# Course card / title-bar icon (any Iconify name + hex colour).
icon:
  type: "fluent-color:book-open-lightbulb-24"
  color: "ffffff"

# Course author(s) - shown as the subtitle on the course home page.
${creditsLine}

# --- Everything below is optional: uncomment a line to enable it -----------

# A custom footer line shown on every page.
# footer: © 2026 My Institution

# A parent course, shown as a home icon in the breadcrumbs.
# parent: course/my-programme.netlify.app

# Add an "Edit this page" button linking back to the source repo.
# github: https://github.com/my-org/my-course/blob/main

# Force GitHub sign-in before the course can be viewed.
# auth: 1

# Private course: hidden from the Gallery/Catalogue and the login menus
# (pair with enrollment.yaml to restrict exactly who can view it).
# private: 1

# Portfolio mode: show units and links only - no topics or table of contents.
# portfolio: true

# Hide every video in the course without removing the ids.
# hideVideos: true

# Auto-number lab steps (01, 02, ...) from their file order.
# labStepsAutoNumber: true

# LLM resources page: 0 = off, 1 = generated but link hidden, 2 = link shown.
# llm: 2

# Talk PDF reader: adobe (default) or mozilla.
# defaultPdfReader: mozilla

# PDF orientation for the Adobe reader: landscape (default) or portrait.
# pdfOrientation: portrait

# Enable the shared whiteboard.
# whiteboard: 1

# Hide selected topic folders from students...
# ignore:
#   - topic-01
# ...and set a PIN the instructor can enter anywhere to reveal them again.
# ignorepin: 4019

# --- Companion links (shown in the course toolbar) ------------------------
# slack: https://my-workspace.slack.com/
# moodle: https://moodle.my-institution.edu/course/view.php?id=1
# youtube: https://youtube.com/@my-channel
# zoom: https://zoom.us/j/00000000000
# teams: https://teams.microsoft.com/l/meetup-join/...
# podcast: https://my-podcast.example.com/

# Custom companions (any service, each with its own icon):
# companions:
#   piazza:
#     link: https://piazza.com/my-course
#     title: Course Piazza
#     icon:
#       type: academicons:piazza
#       color: info
`;
}

/**
 * Netlify build config placed at the course root. Connect the repository to
 * Netlify and it builds on every push: Deno (available in Netlify's build
 * image) runs the Tutors generator, which writes the static site into ./json.
 * The redirect + CORS header are repeated here because Netlify only reads the
 * netlify.toml at the repo base - the one the generator writes inside ./json
 * is served as a plain file, not honoured as config.
 */
export function netlifyToml(): string {
  return `# Build & publish this Tutors course straight from Git.
# Connect the repository in Netlify; no other settings needed.

[build]
  command = "deno run -A jsr:@tutors/tutors"
  publish = "json"

# The site is read by the tutors.dev reader, which fetches tutors.json
# cross-origin - allow that, and bounce direct visits to the reader.
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
`;
}

/** Local-timezone YYYY-MM-DD (avoids the UTC roll-back of toISOString). */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * A worked 12-week course calendar seeded from today's date, starting on the
 * Monday on or after today. It runs weeks 1-6, a reading-week break (a week
 * with no `week` number), then weeks 7-12, with an assignment set at week 6 and
 * week 12. The reader turns this into the course timeline.
 */
export function calendarYaml(spec: CourseSpec): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  // Advance to the next Monday (0 days if today is already Monday).
  start.setDate(start.getDate() + ((8 - start.getDay()) % 7));

  // Date for the i-th consecutive Monday from the start (break included).
  const mondayFor = (slot: number): Date => {
    const d = new Date(start);
    d.setDate(start.getDate() + slot * 7);
    return d;
  };

  const lines: string[] = [
    `# Course calendar. For the full format (weeks, breaks and assessments), see:`,
    `#   https://tutors.dev/note/tutors-reference-manual/unit-1-getting-started/note-d-properties#calendar`,
    ``,
    `title: ${spec.courseName} Calendar`,
    `year: ${start.getFullYear()}`,
    `weeks:`,
  ];

  let slot = 0;
  for (let week = 1; week <= 12; week++) {
    const date = mondayFor(slot);
    lines.push(`  - date: ${isoDate(date)}`);
    lines.push(`    week: ${week}`);
    lines.push(`    topic: Week ${week}`);
    // Assignments handed out at the mid-point and end of the course.
    if (week === 6 || week === 12) {
      const due = mondayFor(slot);
      due.setDate(due.getDate() + 4); // due the Friday of that week
      lines.push(`    assessment:`);
      lines.push(`      name: Assignment ${week === 6 ? 1 : 2}`);
      lines.push(`      due: ${isoDate(due)}`);
      lines.push(`      percentage: 50`);
      lines.push(`      submission: GitHub`);
    }
    slot++;

    // A break week (no `week` number) after the first half of the course.
    if (week === 6) {
      const breakDate = mondayFor(slot);
      lines.push(`  - date: ${isoDate(breakDate)}`);
      lines.push(`    topic: Reading Week`);
      slot++;
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * A private-course enrollment list. Everything is commented out so the file is
 * inert until an educator opts in - uncommenting the entries turns the course
 * private and restricts it to the listed IDs.
 */
export function enrollmentYaml(spec: CourseSpec): string {
  return `# Enrollment makes this a private course, visible only to the people listed
# below. It is disabled while every line is commented out.
#
# All IDs below are GitHub IDs - the username in your GitHub profile URL
# (github.com/octocat -> octocat). Students sign in to Tutors with GitHub and
# access is granted by matching their GitHub ID against this list.
#
# These rules only take effect when 'auth: 1' is set in properties.yaml -
# without it, sign-in is not required and this list is ignored.
#
# To enable it, remove the leading '#' from the lines you need and replace the
# dummy values with real ones:
#
#   educators  - GitHub IDs of staff who can always access the course
#   whitelist  - GitHub IDs of the students allowed to view the course
#   students   - maps each GitHub ID to a display name (used by Tutors Time analytics)
#
# For more on role-based access control, see:
#   https://tutors.dev/note/tutors-reference-manual/unit-3-advanced/note-e-rbac

# educators:
#   - lecturer-github-id

# whitelist:
#   - ada-github-id
#   - alan-github-id

# students:
#   - name: Ada Lovelace
#     id: ada-github-id
#   - name: Alan Turing
#     id: alan-github-id
`;
}

/**
 * Palette of distinct topic icons, applied in order across all topics so each
 * card gets its own colour/glyph. Wraps around if a course has more than six.
 */
export const topicIcons = [
  "fluent-color:book-24",
  "fluent-color:lightbulb-24",
  "fluent-color:code-24",
  "fluent-color:trophy-24",
  "fluent-color:clipboard-24",
  "fluent-color:board-24",
];

export function topicMd(topicNumber: number, topicName: string, icon: string): string {
  return `---
icon:
  type: ${icon}
---

# ${topicName}

Summary of this topic (this line appears on the topic card).

This topic introduces the key concepts for week ${topicNumber} of the course.
`;
}

export function unitMd(unitNumber: number): string {
  return `Unit ${unitNumber}

Summary of this unit (this line appears with the unit heading).
`;
}

export function sideMd(): string {
  return `Reference

Summary of this side unit (this line appears with the unit heading).
`;
}

export function labSetupMd(labName: string): string {
  return `---
icon:
  type: fluent-color:wrench-screwdriver-24
---

# ${labName}

## Prerequisites

- List any tools or accounts needed

## Getting Started

Describe the initial setup steps here.
`;
}

export function labStepMd(stepNumber: number, totalSteps: number): string {
  return `# Step ${stepNumber}

Write your lab instructions for step ${stepNumber} of ${totalSteps} here.
`;
}

export function talkMd(topicNumber: number): string {
  return `---
icon:
  type: fluent-color:slide-text-sparkle-24
---

# Talk ${topicNumber}

Summary of this talk (appears on the talk card).

This talk covers the key concepts introduced in topic ${topicNumber}.
`;
}

export function talkMarp(topicNumber: number): string {
  return `---
marp: true
theme: default
paginate: true
---

# Talk ${topicNumber}

### Presentation Title

---

## What We'll Cover

- The goals for this topic
- Key concepts and vocabulary
- How the ideas fit together
- Where to go next

---

## Key Concept

> Replace this with the central idea of your talk.

- Explain the concept in plain language
- Give a concrete example
- Connect it to what students already know

---

## Summary

- Recap the main points
- Point students to the accompanying note and lab
- Preview what comes next
`;
}

export function noteMd(topicNumber: number): string {
  return `---
icon:
  type: fluent-color:notebook-24
---

# Note ${topicNumber}

Summary of this note (appears on the note card).

Add your reference material or supplementary notes here.
`;
}

/** The shared next-steps, used by both the CLI message and the reader wizard. */
export function nextSteps(spec: CourseSpec): string[] {
  return [
    `Unzip the course archive`,
    `Drag and drop the unzipped course folder to https://app.netlify.com/drop`,
    `Explore your site - the defaut course will look like this https://tutors.dev/course/tutors-template-a`,
    `Edit course.md - update your course description`,
    `Edit each topic-*/topic-*.md - rename and describe your topics/note/labs`,
    `Drag and drop the course folder to Netlify to republish`,
    'Explore the docs: https://tutors.dev/course/tutors-reference-manual'
  ];
}

export function nextStepsMessage(spec: CourseSpec): string {
  const steps = nextSteps(spec)
    .map((step, i) => `  ${i + 1}. ${step}`)
    .join("\n");
  return `
Course created in ./${spec.courseId}/

Next steps:
${steps}
`;
}
