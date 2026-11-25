import { json } from "@sveltejs/kit";
import { now } from "@tutors/clock";
import type { RequestHandler } from "./$types";

// Validation runs in the browser and needs no database or authentication service.
export const GET: RequestHandler = () => json({ status: "ok", app: "tutors-validator", timestamp: now().toISOString() });
