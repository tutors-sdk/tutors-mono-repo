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
  type: "flat-color-icons:graduation-cap"
  color: "ffffff"
`;
}

export function topicMd(topicNumber: number, topicName: string): string {
  return `---
icon:
  type: flat-color-icons:opened-folder
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

export function labSetupMd(labName: string): string {
  return `---
icon:
  type: flat-color-icons:engineering
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
  type: flat-color-icons:video-projector
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
  type: flat-color-icons:document
---

# Note ${topicNumber}

Summary of this note (appears on the note card).

Add your reference material or supplementary notes here.
`;
}

export function nextStepsMessage(spec: CourseSpec): string {
  return `
Course created in ./${spec.courseId}/

Next steps:
  1. cd ${spec.courseId}
  2. Edit course.md - update your course description
  3. Edit each topic-*/topic-*.md - rename and describe your topics
  4. Run: deno run -A jsr:@tutors/tutors
  5. Drag and drop the generated json folder to https://app.netlify.com/drop
`;
}
