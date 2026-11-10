import type { ValidateFunction } from "ajv";
import validateCourseSchema from "./course-schema.js";
import { checkMetadata, checkQuizText, sortFindings, type Finding } from "@tutors/course-rules";

const schema = validateCourseSchema as ValidateFunction;
const MAX_JSON_BYTES = 20 * 1024 * 1024;

/** Accept a course host, a Netlify site id, a reader link, or tutors.json itself. */
export function publishedCourseUrl(input: string): string {
  let address = input.trim();
  if (!address) throw new Error("Enter a course URL or Netlify site name.");
  if (/^[a-z\d][a-z\d-]*$/i.test(address) && address !== "localhost") address += ".netlify.app";
  const url = new URL(address.includes("://") ? address : `https://${address}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an http or https course URL without a username or password.");
  if (["tutors.dev", "next.tutors.dev"].includes(url.hostname) && url.pathname.startsWith("/course/")) {
    const course = decodeURIComponent(url.pathname.slice("/course/".length));
    if (course.includes("://") || course.startsWith("/")) throw new Error("Enter the published course URL instead of this reader link.");
    return publishedCourseUrl(course);
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/tutors.json")) {
    let path = url.pathname;
    while (path.endsWith("/")) path = path.slice(0, -1);
    url.pathname = `${path}/tutors.json`;
  }
  return url.href;
}

/** Only the browser fetches the course; no validator server receives a URL or course contents. */
export async function fetchPublishedCourse(url: string, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "omit", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("The course could not be reached. Check the URL and connection. Its host must allow cross-origin reads; otherwise check a source ZIP locally.", { cause: error });
  }
  if (!response.ok) throw new Error(`The course returned HTTP ${response.status}. Check that tutors.json is published at this address.`);
  if (Number(response.headers.get("content-length")) > MAX_JSON_BYTES) {
    await response.body?.cancel();
    throw new Error("This tutors.json is larger than 20 MB. Check a source ZIP instead.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The course returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) throw new Error("This tutors.json is larger than 20 MB. Check a source ZIP instead.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("This address did not return readable JSON. Check that it serves a generated Tutors course.");
  }
}

export function validatePublishedCourse(course: unknown): Finding[] {
  const compatible = structuredClone(course);
  const pendingCompatibility: unknown[] = [compatible];
  let legacyItems = 0;
  while (pendingCompatibility.length) {
    const node = pendingCompatibility.pop();
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const lo = node as Record<string, unknown>;
    // Older generators omitted this field. Check their remaining data without cascading allOf errors.
    if (typeof lo.type === "string" && lo.type !== "step" && lo.authLevel === undefined) { lo.authLevel = 0; legacyItems++; }
    if (Array.isArray(lo.los)) pendingCompatibility.push(...lo.los);
  }
  const valid = schema(compatible);
  const findings: Finding[] = valid
    ? []
    : (schema.errors ?? []).filter(error => error.keyword !== "if").map((error) => ({
        rule: "V020",
        severity: "error",
        path: `tutors.json${error.instancePath}`,
        message: `${error.keyword === "required" ? `Missing required field: ${error.params.missingProperty}` : error.keyword === "unevaluatedProperties" ? `Unexpected field: ${error.params.unevaluatedProperty}` : `Course data ${error.message ?? "does not match the Tutors schema"}`}. Regenerate the course with the current Tutors generator.`
      }));
  if (legacyItems) findings.push({ rule: "V020", severity: "warn", path: "tutors.json", message: `Older generator format: ${legacyItems} course item(s) omit authLevel. The remaining data has been checked using the default value; publish again with the current generator to update the format. No access settings have been changed.` });
  if (course && typeof course === "object" && !Array.isArray(course)) {
    const data = course as Record<string, unknown>;
    for (const field of ["properties", "calendar", "enrollment"]) {
      if (data[field] !== undefined) findings.push(...checkMetadata(`${field}.yaml`, data[field]));
    }
    const pending: { node: unknown; path: string }[] = [{ node: course, path: "tutors.json" }];
    while (pending.length) {
      const { node, path } = pending.pop()!;
      if (!node || typeof node !== "object" || Array.isArray(node)) continue;
      const lo = node as Record<string, unknown>;
      if (lo.type === "quiz" && typeof lo.contentMd === "string") findings.push(...checkQuizText(lo.contentMd, `${path}/contentMd`));
      if (Array.isArray(lo.los)) lo.los.forEach((child, index) => pending.push({ node: child, path: `${path}/los/${index}` }));
    }
  }
  return sortFindings(findings);
}
