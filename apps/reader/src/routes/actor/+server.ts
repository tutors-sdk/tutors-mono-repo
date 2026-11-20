/**
 * GET /actor: who is signed in, for the universal root load (Rule 0771). A hosted reader answers it; an
 * anonymous or static reader never asks. Outside /api/ on purpose: like the __data.json request it replaces,
 * it renews a rolling session. Never cached: it changes on sign-in and sign-out.
 */
import { json, type RequestHandler } from "@sveltejs/kit";
import { actorData } from "../../lib/actor-data.ts";

export const GET: RequestHandler = ({ locals }) => json(actorData(locals.actor), { headers: { "Cache-Control": "private, no-store" } });
