import { describe, it, expect } from "vitest";
import { GET as readerLive } from "../../../apps/reader/src/routes/healthz/live/+server.ts";
import { GET as catalogueLive } from "../../../apps/catalogue/src/routes/healthz/live/+server.ts";
import { GET as liveLive } from "../../../apps/live/src/routes/healthz/live/+server.ts";
import { GET as timeLive } from "../../../apps/time/src/routes/healthz/live/+server.ts";

const probes = {
  reader: readerLive,
  catalogue: catalogueLive,
  live: liveLive,
  time: timeLive,
};

// The liveness probe must stay dependency-free: Kubernetes restarts the pod when
// it fails, so it must not depend on Supabase or anything else being reachable.
describe("/healthz/live", () => {
  for (const [app, GET] of Object.entries(probes)) {
    it(`${app} answers 200 with a bare ok body`, async () => {
      const response = await GET({} as never);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({ status: "ok" });
    });
  }
});
