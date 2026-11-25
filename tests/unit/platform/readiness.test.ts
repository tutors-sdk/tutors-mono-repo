import { describe, expect, it } from "vitest";
import { readinessReport } from "../../../packages/platform/app-config/src/readiness.js";

/**
 * The one readiness decision behind every app's /healthz: which facts make a deployment unready (503),
 * which only degrade it (200), and the body the platform and the release harness read.
 */
const base = { app: "tutors-reader", timestamp: "2026-01-05T09:00:00.000Z", errors: { total: 0 } };
const ok = { status: "ok" };

describe("the readiness answer", () => {
  it("is ok and 200 when the environment is complete and every dependency answered or was skipped", () => {
    const report = readinessReport({ ...base, environment: ok, dependencies: { serviceKey: { status: "skipped" }, supabase: { status: "ok", latencyMs: 4 } } });
    expect(report).toEqual({
      status: 200,
      body: {
        status: "ok",
        timestamp: base.timestamp,
        app: "tutors-reader",
        checks: { environment: ok, serviceKey: { status: "skipped" }, supabase: { status: "ok", latencyMs: 4 } },
        errors: { last60min: { total: 0 } }
      }
    });
  });

  it("lists the environment first and then the dependencies in the order given", () => {
    const report = readinessReport({ ...base, environment: ok, dependencies: { serviceKey: ok, supabase: ok } });
    expect(Object.keys(report.body.checks)).toEqual(["environment", "serviceKey", "supabase"]);
    expect(Object.keys(report.body)).toEqual(["status", "timestamp", "app", "checks", "errors"]);
  });

  it("is ok with no dependencies at all", () => {
    const report = readinessReport({ ...base, environment: ok });
    expect(report.status).toBe(200);
    expect(report.body.status).toBe("ok");
    expect(report.body.checks).toEqual({ environment: ok });
    expect(report.body.errors).toEqual({ last60min: { total: 0 } });
  });

  it("is misconfigured and 503 when the environment lacks a variable, whatever the dependencies say", () => {
    const environment = { status: "missing", missing: ["PUBLIC_SUPABASE_URL"] };
    for (const supabase of [ok, { status: "error" }, { status: "skipped" }]) {
      const report = readinessReport({ ...base, environment, dependencies: { supabase } });
      expect(report.status).toBe(503);
      expect(report.body.status).toBe("misconfigured");
      expect(report.body.checks.environment).toBe(environment);
    }
  });

  it("is misconfigured and 503 when a dependency rejects the app's credentials", () => {
    const report = readinessReport({ ...base, environment: ok, dependencies: { serviceKey: { status: "rejected", message: "refused" }, supabase: ok } });
    expect(report.status).toBe(503);
    expect(report.body.status).toBe("misconfigured");
  });

  it("is degraded but still 200 when a dependency did not answer", () => {
    for (const dependencies of [{ supabase: { status: "error" } }, { serviceKey: { status: "unreachable" }, supabase: ok }, { serviceKey: ok, supabase: { status: "error" } }]) {
      const report = readinessReport({ ...base, environment: ok, dependencies });
      expect(report.status).toBe(200);
      expect(report.body.status).toBe("degraded");
    }
  });

  it("puts a rejection ahead of an outage", () => {
    const report = readinessReport({ ...base, environment: ok, dependencies: { serviceKey: { status: "rejected" }, supabase: { status: "error" } } });
    expect(report.status).toBe(503);
    expect(report.body.status).toBe("misconfigured");
  });
});
