/**
 * The two incompatible time formats in the SCORM data model.
 *
 * SCORM 1.2 uses `HHHH:MM:SS.SS`; SCORM 2004 replaced it with an ISO-8601 duration such
 * as `PT1H30M5S`. Both appear in `session_time` and `total_time`, so an LMS has to read
 * and write whichever one the content speaks.
 */

import type { ScormVersion } from "./types.ts";

const ISO_DURATION = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Nominal lengths, used only so a content package that reports days or months is not lost. */
const SECONDS_PER = { year: 31536000, month: 2592000, day: 86400, hour: 3600, minute: 60 };

function parseIsoDuration(value: string): number {
  const match = ISO_DURATION.exec(value.trim());
  if (!match) return 0;
  const [, years, months, days, hours, minutes, seconds] = match.map((part) => (part === undefined ? 0 : Number(part)));
  return (
    years * SECONDS_PER.year +
    months * SECONDS_PER.month +
    days * SECONDS_PER.day +
    hours * SECONDS_PER.hour +
    minutes * SECONDS_PER.minute +
    seconds
  );
}

function parseCmiTimespan(value: string): number {
  const parts = value.trim().split(":");
  if (parts.length !== 3) return 0;
  const [hours, minutes, seconds] = parts.map(Number);
  if ([hours, minutes, seconds].some(isNaN)) return 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/** Read a duration in whichever format the given profile uses. */
export function parseDuration(value: string, version: ScormVersion): number {
  if (!value) return 0;
  // Be forgiving: content occasionally reports the other profile's format.
  if (value.trim().startsWith("P")) return parseIsoDuration(value);
  if (value.includes(":")) return parseCmiTimespan(value);
  return 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** Write a duration in whichever format the given profile expects. */
export function formatDuration(totalSeconds: number, version: ScormVersion): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (version === "2004") {
    let out = "PT";
    if (hours) out += `${hours}H`;
    if (minutes) out += `${minutes}M`;
    // Always emit seconds, so zero renders as PT0S rather than the invalid "PT".
    return `${out}${seconds}S`;
  }
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.00`;
}
