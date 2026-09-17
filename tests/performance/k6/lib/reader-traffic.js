/* global __ENV */
// Shared k6 traffic model for the reader (runway tier L). Imported by
// reader.js (nightly load) and reader-soak.js (nightly soak).
//
// Environment:
//   BASE_URL      app under test, e.g. http://app:3000
//   RATE          requests per second (constant arrival rate)
//   DURATION      k6 duration string, e.g. 30s, 10m
//   COURSE_PATH   a course page; empty disables it (e.g. no fixture course server)
//   P95_MS        p95 ceiling in ms applied to every page
//   ERROR_RATE    maximum failed-request rate, e.g. 0.01
import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";

export const BASE_URL = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
export const COURSE_PATH = __ENV.COURSE_PATH === undefined ? "/course/reference-course" : __ENV.COURSE_PATH;

/**
 * Weighted page mix. The reader renders in the browser (ssr = false), so a
 * page request returns a small shell and most of what a student costs the
 * server is the immutable JS and CSS behind it; `asset` requests those.
 */
export const PAGES = [
  { name: "home", path: "/", weight: 2 },
  { name: "healthz", path: "/healthz/live", weight: 1 },
  ...(COURSE_PATH ? [{ name: "course", path: COURSE_PATH, weight: 3 }] : []),
  { name: "asset", path: null, weight: 4 }
];

const ASSET = /(?:\.\.\/|\/|\.\/)?(_app\/immutable\/[\w./-]+?\.(?:js|css))/g;
const CHUNK_IMPORT = /["'](\.\.?\/[\w./-]+?\.js)["']/g;

/**
 * Discover the assets a first visit downloads: those linked from the shell,
 * plus the chunks the entry scripts import. Runs once per test in setup().
 */
export function discoverAssets() {
  // Bodies are discarded for load traffic; discovery needs them.
  const shell = http.get(`${BASE_URL}${COURSE_PATH || "/"}`, { responseType: "text" });
  const assets = new Set();
  for (const match of String(shell.body).matchAll(ASSET)) assets.add(`/${match[1]}`);
  for (const entry of [...assets].filter((a) => a.includes("/entry/"))) {
    const script = http.get(`${BASE_URL}${entry}`, { responseType: "text" });
    const dir = entry.slice(0, entry.lastIndexOf("/"));
    for (const match of String(script.body).matchAll(CHUNK_IMPORT)) {
      const parts = `${dir}/${match[1]}`.split("/");
      const resolved = [];
      for (const part of parts) {
        if (part === "..") resolved.pop();
        else if (part !== ".") resolved.push(part);
      }
      assets.add(resolved.join("/"));
    }
  }
  if (assets.size === 0) throw new Error(`no _app/immutable assets found behind ${COURSE_PATH || "/"}`);
  console.log(`discovered ${assets.size} immutable assets behind ${COURSE_PATH || "/"}`);
  return { assets: [...assets].sort() };
}

export function buildOptions({ rate, duration, p95Ms, errorRate, phases = false }) {
  const pageThresholds = {};
  for (const page of PAGES) {
    const tags = phases ? ["early", "late"].map((phase) => `page:${page.name},phase:${phase}`) : [`page:${page.name}`];
    for (const tag of tags) pageThresholds[`http_req_duration{${tag}}`] = [`p(95)<${p95Ms}`];
  }
  return {
    discardResponseBodies: true,
    summaryTrendStats: ["med", "p(90)", "p(95)", "p(99)", "max"],
    scenarios: {
      reader: {
        executor: "constant-arrival-rate",
        rate,
        timeUnit: "1s",
        duration,
        preAllocatedVUs: Math.max(10, rate * 2),
        maxVUs: Math.max(50, rate * 10)
      }
    },
    thresholds: {
      http_req_failed: [`rate<${errorRate}`],
      // The server could not keep up with the arrival rate at all.
      dropped_iterations: [`count<${Math.max(1, Math.ceil(rate * 0.01))}`],
      checks: [`rate>${1 - errorRate}`],
      ...pageThresholds
    }
  };
}

function pick() {
  const total = PAGES.reduce((sum, page) => sum + page.weight, 0);
  let roll = Math.random() * total;
  for (const page of PAGES) {
    roll -= page.weight;
    if (roll <= 0) return page;
  }
  return PAGES[0];
}

export function visit(data, { phases = false } = {}) {
  const page = pick();
  const tags = { page: page.name };
  const path = page.path ?? data.assets[Math.floor(Math.random() * data.assets.length)];
  // Soak runs compare the first and last thirds to spot slow degradation.
  if (phases) {
    const progress = exec.scenario.progress;
    if (progress < 1 / 3) tags.phase = "early";
    else if (progress > 2 / 3) tags.phase = "late";
    else tags.phase = "middle";
  }
  // Browsers ask for compression; adapter-node serves precompressed br/gz assets.
  const response = http.get(`${BASE_URL}${path}`, { tags, redirects: 0, headers: { "Accept-Encoding": "br, gzip" } });
  check(response, { "status is 2xx or 3xx": (r) => r.status >= 200 && r.status < 400 }, tags);
}
