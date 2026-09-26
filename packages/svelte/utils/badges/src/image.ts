/**
 * A badge image drawn from a badges.yaml entry: a medal with the badge's initials, its title and
 * the course. It is plain SVG, so it can be shown inline, saved, or embedded in the Open Badges
 * credential as a data URI.
 */

import type { BadgeDefinition } from "./definitions.ts";

/** Medal colours; a badge always gets the same one, picked from its id. */
const PALETTE = ["#246F78", "#7A4FA3", "#B4541E", "#2F6FB0", "#3F7D3A", "#9A6A00"];

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

function colourFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initials(title: string): string {
  const words = title.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words
    .slice(0, 2)
    .map((w) => [...w.replace(/[^\p{L}\p{N}]/gu, "")][0] ?? "")
    .join("")
    .toUpperCase();
}

/** Splits text into at most `maxLines` lines of about `width` characters, ending with "…" when cut. */
function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, width - 1)}…`;
  return kept;
}

/** The badge as a 240 by 320 SVG document. */
export function badgeSvg(badge: BadgeDefinition, courseTitle: string): string {
  const colour = colourFor(badge.id);
  const titleLines = wrap(badge.title, 22, 2);
  const title = titleLines
    .map((l, i) => `<tspan x="120" dy="${i === 0 ? 0 : 20}">${escapeXml(l)}</tspan>`)
    .join("");
  const course = wrap(courseTitle, 30, 1)[0] ?? "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" width="240" height="320" role="img" aria-label="${escapeXml(`${badge.title} badge, ${courseTitle}`)}">`,
    `<path d="M84 150 L64 236 L94 222 L110 250 L120 160 Z" fill="${colour}" opacity="0.75"/>`,
    `<path d="M156 150 L176 236 L146 222 L130 250 L120 160 Z" fill="${colour}" opacity="0.75"/>`,
    `<circle cx="120" cy="100" r="78" fill="${colour}"/>`,
    `<circle cx="120" cy="100" r="64" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="4 5"/>`,
    `<text x="120" y="116" text-anchor="middle" font-family="system-ui, sans-serif" font-size="44" font-weight="700" fill="#ffffff">${escapeXml(initials(badge.title))}</text>`,
    `<text x="120" y="270" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="600" fill="#202020">${title}</text>`,
    `<text x="120" y="${titleLines.length > 1 ? 312 : 292}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#636363">${escapeXml(course)}</text>`,
    `</svg>`
  ].join("");
}

/** The SVG as a data URI, for an <img> or the credential's achievement image. */
export function badgeImageDataUri(badge: BadgeDefinition, courseTitle: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(badgeSvg(badge, courseTitle))) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
