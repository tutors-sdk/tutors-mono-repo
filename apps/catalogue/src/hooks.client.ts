import type { HandleClientError } from "@sveltejs/kit";

export const handleError: HandleClientError = ({ error }) => {
  console.error("Catalogue client error:", error);
  return {
    message: "An unexpected error occurred"
  };
};
