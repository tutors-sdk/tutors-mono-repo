import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const startTime = Date.now();

export const GET: RequestHandler = async () => {
  return json({
    status: "ok",
    service: "tutors-catalogue",
    timestamp: new Date().toISOString(),
    uptime_s: Math.round((Date.now() - startTime) / 1000)
  });
};
