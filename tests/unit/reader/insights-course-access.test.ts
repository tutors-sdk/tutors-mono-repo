import { describe, expect, it, vi } from "vitest";

vi.mock("$app/env/private", () => ({ PRIVATE_SUPABASE_SERVICE_ROLE_KEY: "service-role-key" }));
vi.mock("$app/env/public", () => ({ PUBLIC_SUPABASE_URL: "https://supabase.invalid", PUBLIC_ANON_MODE: "FALSE" }));

import { insights } from "../../../apps/reader/src/lib/server/insights.ts";

describe("the course an insights read names", () => {
  it("is read without following a redirect, so a course site cannot send the server to another host", async () => {
    const site = vi.fn(async (_url: string | URL | Request, init?: Parameters<typeof fetch>[1]) => {
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    });
    const answer = await insights(site as unknown as typeof fetch).get(new URLSearchParams("courseId=redirecting&day=2026-01-05"), { login: "ellen" });
    expect(site).toHaveBeenCalledWith("https://redirecting.netlify.app/tutors.json", { redirect: "manual" });
    expect(answer).toMatchObject({ status: 503, body: { reason: "unavailable" } });
  });
});
