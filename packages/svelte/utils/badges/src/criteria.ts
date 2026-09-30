/**
 * Evaluates a badge's criteria against a student's learning records.
 */

import type { BadgeDefinition } from "./definitions.ts";

/** A learning object as the course tree gives it; composites carry their children in `los`. */
export interface CourseNode {
  id: string;
  type: string;
  route: string;
  los?: CourseNode[];
}

export interface StudentActivity {
  /** Routes of the learning objects the student has opened in this course. */
  openedRoutes: Iterable<string>;
  /** Days (YYYY-MM-DD) on which the student was active in this course. */
  activeDays: Iterable<string>;
}

const COMPOSITES = new Set(["course", "topic", "unit", "side"]);

function findTopic(node: CourseNode, topicId: string): CourseNode | undefined {
  if (node.type === "topic" && node.id === topicId) return node;
  for (const child of node.los ?? []) {
    const found = findTopic(child, topicId);
    if (found) return found;
  }
  return undefined;
}

function leaves(node: CourseNode): CourseNode[] {
  return (node.los ?? []).flatMap((child) => (COMPOSITES.has(child.type) ? leaves(child) : [child]));
}

/**
 * Whether the student has met the badge's criteria. Manual badges are never met automatically,
 * and a topic that is missing or has no matching learning objects earns nothing.
 */
export function meetsCriteria(badge: BadgeDefinition, course: CourseNode, activity: StudentActivity): boolean {
  const criteria = badge.criteria;
  switch (criteria.kind) {
    case "manual":
      return false;
    case "active-days":
      return new Set(activity.activeDays).size >= criteria.days;
    case "opened-all": {
      const topic = findTopic(course, criteria.topic);
      if (!topic) return false;
      const required = leaves(topic).filter((lo) => criteria.type === undefined || lo.type === criteria.type);
      if (required.length === 0) return false;
      const opened = new Set(activity.openedRoutes);
      return required.every((lo) => opened.has(lo.route));
    }
  }
}
