// shortcut: #320 is not merged; replace this assertion with its personal-data route when available.
// The fixture uses the actual reader hooks and SvelteKit cookie handling, with no test-login route.
export function GET({ locals }) {
  return locals.actor ? Response.json({ actor: locals.actor }) : new Response("Unauthorized", { status: 401 });
}
