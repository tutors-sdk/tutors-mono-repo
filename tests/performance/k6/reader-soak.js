/* global __ENV */
// Nightly soak for the reader (runway tier L): a modest rate for a long time.
// Requests are tagged early/middle/late so thresholds hold at both ends, and
// the orchestrator samples container memory to catch leaks.
//
//   pnpm check:load --image tutors/reader:local --script reader-soak.js --rate 5 --duration 45m
import { buildOptions, discoverAssets, visit } from "./lib/reader-traffic.js";

export const options = buildOptions({
  rate: Number(__ENV.RATE || 5),
  duration: __ENV.DURATION || "45m",
  p95Ms: Number(__ENV.P95_MS || 500),
  errorRate: Number(__ENV.ERROR_RATE || 0.01),
  phases: true
});

export function setup() {
  return discoverAssets();
}

export default function (data) {
  visit(data, { phases: true });
}
