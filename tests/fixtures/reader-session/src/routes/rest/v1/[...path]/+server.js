// Discard test-only metadata/analytics calls; no request can reach a real Supabase instance.
function empty({ request }) {
  return Response.json([], { headers: {
    "access-control-allow-origin": "http://localhost:5173",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": request.headers.get("access-control-request-headers") ?? "*"
  } });
}
export { empty as GET, empty as POST, empty as PATCH, empty as DELETE, empty as OPTIONS };
