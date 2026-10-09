import type { RequestHandler } from "./$types";
export const GET: RequestHandler = ({ locals }) => Response.json({ actor: locals.actor, expiresAt: locals.expiresAt });
