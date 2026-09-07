/**
 * Resolve a course id to the origin serving its published `tutors.json`.
 *
 * A course id is one of three things and they are not distinguishable by
 * shape alone, so the order of these checks is the contract:
 *
 *   - `localhost:5173` / `192.168.0.5:5173` — a locally served course, http.
 *   - `course.example.com` / `https://course.example.com` — a self-hosted
 *     course on its own domain, https.
 *   - `cs101-2025` — a bare id, which Tutors publishes to Netlify.
 *
 * Assuming the last case unconditionally is what made local and self-hosted
 * courses invisible to anything that reads `tutors.json`: the fetch resolves
 * to `https://localhost:5173.netlify.app`, fails, and the caller sees the same
 * result as a course that genuinely has no such file.
 */
export function courseJsonUrl(courseId: string): string {
  const id = courseId.trim();
  const isLocal = id.startsWith("localhost") || id.startsWith("192");
  const isDomain = /^(https?:\/\/)?([A-Za-z0-9-]+\.)+[A-Za-z]{2,}(:[0-9]+)?(\/.*)?$/.test(id);

  if (isLocal) return `http://${id.replace(/\/+$/, "")}/tutors.json`;
  if (isDomain) {
    const withScheme = /^https?:\/\//.test(id) ? id : `https://${id}`;
    return `${withScheme.replace(/\/+$/, "")}/tutors.json`;
  }
  return `https://${id}.netlify.app/tutors.json`;
}
