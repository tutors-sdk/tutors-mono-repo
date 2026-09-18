import { rune } from "@tutors/runes";

// Check if we're in a browser environment (avoiding $app/environment for package compatibility)
const browser = typeof window !== "undefined";

function getReducedMotion(): boolean {
  if (!browser) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const prefersReducedMotion = rune(getReducedMotion());

if (browser) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", (e) => {
    prefersReducedMotion.value = e.matches;
  });
}
