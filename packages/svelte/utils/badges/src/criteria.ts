/**
 * Badge criteria evaluated from a student's learning records.
 */

/**
 * Whether the student has opened every learning object in a topic.
 * A topic with no learning objects earns nothing.
 */
export function hasOpenedEveryLearningObject(topicLoRoutes: readonly string[], openedRoutes: Iterable<string>): boolean {
  if (topicLoRoutes.length === 0) return false;
  const opened = new Set(openedRoutes);
  return topicLoRoutes.every((route) => opened.has(route));
}
