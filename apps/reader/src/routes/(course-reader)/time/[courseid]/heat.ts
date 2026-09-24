/** Rounded minutes for a cell, or 0 when nothing was recorded. */
export function minutesOf(value: unknown): number {
  const minutes = Math.round(Number(value) || 0);
  return minutes > 0 ? minutes : 0;
}

/**
 * Heat-scale colour on the design tokens, readable with the normal ink in light and dark mode: success tints
 * deepen up to 200 minutes, then danger tints flag unusually long days (the same bands as the educator view).
 */
export function heatColor(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes <= 200) return `color-mix(in srgb, var(--ui-success) ${Math.round(25 + (minutes / 200) * 45)}%, var(--ui-surface))`;
  return `color-mix(in srgb, var(--ui-danger) ${Math.round(30 + Math.min(1, (minutes - 200) / 600) * 40)}%, var(--ui-surface))`;
}
