/**
 * The root Vitest config has no Svelte compiler, so the `$state` rune in the
 * product's `.svelte.ts` modules is an undefined global under Node. Import this
 * module before any product module: it defines `$state` as the identity
 * function, so `rune(...)` and `LoRecord` run as the real product code, holding
 * plain values instead of reactive ones. Reactivity itself is not under test here.
 */
(globalThis as unknown as { $state: <T>(initial?: T) => T | undefined }).$state = (initial) => initial;

export {};
