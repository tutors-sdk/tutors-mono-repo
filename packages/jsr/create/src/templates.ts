import type { CourseSpec } from "./types.ts";

export function courseMd(spec: CourseSpec): string {
  return `# ${spec.courseName}

${spec.lecturerName ? `By ${spec.lecturerName}. ` : ""}A short summary of your course goes here (this line appears on course cards).

Welcome to ${spec.courseName}! Describe what students will learn,
any prerequisites, and how the course is structured.
`;
}

export function propertiesYaml(spec: CourseSpec): string {
  return `
icon:
  type: "fluent-color:book-open-lightbulb-24"
  color: "ffffff"
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
