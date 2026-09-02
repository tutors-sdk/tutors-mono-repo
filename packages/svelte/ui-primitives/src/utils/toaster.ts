import { createToaster } from "@skeletonlabs/skeleton-svelte";

export const toaster = createToaster({
  placement: "top-end",
  overlap: true,
  gap: 16,
  duration: 8000
});

/**
 * How long (ms) a lecturer broadcast toast stays on screen by default.
 * Longer than the regular toast because the recipient is reading a message
 * from their tutor rather than glancing at it.
 */
export const BROADCAST_TOAST_DURATION = 15_000;
