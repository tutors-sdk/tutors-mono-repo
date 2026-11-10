import type { HandleClientError } from "@sveltejs/kit/hooks";

// Keep errors local too: course filenames and contents must not enter a remote error transport.
export const handleError: HandleClientError = () => ({ status: 500, message: "An unexpected error occurred" });
