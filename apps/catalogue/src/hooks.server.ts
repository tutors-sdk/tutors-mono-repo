import type { Handle, HandleServerError } from "@sveltejs/kit";

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export const handle = securityHeaders;

export const handleError: HandleServerError = ({ error }) => {
  console.error("Catalogue server error:", error);
  return {
    message: "An unexpected error occurred"
  };
};
