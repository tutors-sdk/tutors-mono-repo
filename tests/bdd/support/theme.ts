import type { ThemeService } from "../../../packages/svelte/themes/src/types.ts";

/**
 * Helpers for executable theme features. The theme service is a module-level
 * singleton that reads and writes `localStorage` and `document.documentElement`,
 * so the step files run under happy-dom and reset all three between scenarios.
 */

function freshDocument(): void {
  for (const attribute of ["data-theme", "class", "style"]) document.documentElement.removeAttribute(attribute);
}

/** A first visit: nothing stored, nothing on the document, the service started the way the app layouts start it. */
export function startWithNoStoredPreferences(themeService: ThemeService): void {
  localStorage.clear();
  freshDocument();
  themeService.initDisplay();
}

/**
 * A later session in the same browser: the in-memory state is gone, the
 * document is fresh, and only `localStorage` survives for `initDisplay` to read.
 */
export function startLaterSession(themeService: ThemeService): void {
  themeService.currentTheme.value = "tutors";
  themeService.lightMode.value = "light";
  themeService.cardStyle.value = "portrait";
  freshDocument();
  themeService.initDisplay();
}
