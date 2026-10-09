import { GET as empty } from "../../../rest/v1/[...path]/+server.js";
export const OPTIONS = empty;
export function POST(event) {
  const response = empty(event);
  return new Response(null, { status: 202, headers: response.headers });
}
