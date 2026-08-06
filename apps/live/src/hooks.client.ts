import type { HandleClientError } from "@sveltejs/kit";

export const handleError: HandleClientError = ({ error }) => {
  console.error("Live client error:", error);
  return {
    message: "An unexpected error occurred"
  };
};
