/* global __ENV */
// Nightly load test for the reader (runway tier L): a fixed arrival rate for a
// fixed duration with p95 and error-rate thresholds per page.
//
//   pnpm check:load --image tutors/reader:local --rate 20 --duration 30s
import { buildOptions, discoverAssets, visit } from "./lib/reader-traffic.js";

export const options = buildOptions({
  rate: Number(__ENV.RATE || 20),
  duration: __ENV.DURATION || "10m",
  p95Ms: Number(__ENV.P95_MS || 500),
  errorRate: Number(__ENV.ERROR_RATE || 0.01)
});

export function setup() {
  return discoverAssets();
}

export default function (data) {
  visit(data);
}
