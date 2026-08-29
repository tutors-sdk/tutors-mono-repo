import type { CourseSpec } from "./types.ts";

export function courseMd(spec: CourseSpec): string {
  return `# ${spec.courseName}

${spec.lecturerName ? `By ${spec.lecturerName}. ` : ""}A short summary of your course goes here (this line appears on course cards).

<!-- EDIT: Replace this with your full course description.
     This content appears on the course landing page.
     You can use full Markdown: headings, lists, links, images, code blocks. -->

Welcome to ${spec.courseName}! Describe what students will learn,
any prerequisites, and how the course is structured.
`;
}

export function propertiesYaml(spec: CourseSpec): string {
  return `# Course properties - all fields are optional
# Uncomment and edit the properties you need

footer: "${spec.lecturerName || "Department Name"}"
# labStepsAutoNumber: true
# icon:
#   type: "code"
#   color: "primary"
`;
}

export function topicMd(topicNumber: number, topicName: string): string {
  return `# ${topicName}

Summary of this topic (this line appears on the topic card).

<!-- EDIT: Replace the title and summary above.
     Then replace this block with a description of what this topic covers. -->

This topic introduces the key concepts for week ${topicNumber} of the course.
`;
}

export function labSetupMd(labName: string): string {
  return `# ${labName}

<!-- EDIT: This is the setup step for your lab.
     The title above becomes the lab name in navigation.
     Describe what students need before starting. -->

## Prerequisites

- List any tools or accounts needed

## Getting Started

Describe the initial setup steps here.
`;
}

export function labStepMd(stepNumber: number, totalSteps: number): string {
  return `# Step ${stepNumber}

<!-- EDIT: Rename this file to change the navigation label.
     The number controls the order. The name between dots appears in navigation. -->

Write your lab instructions for step ${stepNumber} of ${totalSteps - 1} here.
`;
}

export function talkMd(topicNumber: number): string {
  return `# Talk ${topicNumber}

Summary of this talk (appears on the talk card).

<!-- EDIT: Replace the title and summary above.
     To add slides, place a .pdf file in this folder. -->

This talk covers the key concepts introduced in topic ${topicNumber}.
`;
}

export function noteMd(topicNumber: number): string {
  return `# Note ${topicNumber}

Summary of this note (appears on the note card).

<!-- EDIT: Replace the title and summary above.
     Notes are ideal for reference material or supplementary content. -->

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
  4. Run: deno run jsr:@tutors/tutors
`;
}
