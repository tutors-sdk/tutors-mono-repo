/**
 * GET /api/actor: who is signed in, for the universal root load (Rule 0771). A hosted reader answers it; an
 * anonymous or static reader never asks. Never cached: it changes on sign-in and sign-out.
 */
import { json, type RequestHandler } from "@sveltejs/kit";
import { actorData } from "../../../lib/actor-data.ts";

export const GET: RequestHandler = ({ locals }) => json(actorData(locals.actor), { headers: { "Cache-Control": "no-store" } });
