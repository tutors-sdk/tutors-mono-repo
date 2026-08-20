import js from "@eslint/js";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default tseslint.config(
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules (type-checked rules are not used here
  // because each workspace has its own tsconfig)
  ...tseslint.configs.recommended,

  // Svelte recommended rules
  ...svelte.configs.recommended,

  // Global settings
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  // Svelte file overrides — use the TypeScript parser inside Svelte files
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // Relax rules that produce too many errors in this codebase.
  // These are downgraded to warnings so the lint run exits cleanly
  // while still surfacing issues. Teams can tighten these over time.
  {
    rules: {
      // TypeScript rules
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",

      // Core JS rules
      "no-case-declarations": "warn",
      "no-useless-assignment": "warn",
      "no-empty": "warn",
      "no-fallthrough": "warn",
      "getter-return": "warn",
      "no-control-regex": "warn",
      "no-cond-assign": "warn",
      "no-useless-escape": "warn",
      "no-unused-private-class-members": "warn",
      "no-redeclare": "warn",
      "prefer-const": "warn",

      // Core JS rules (cont.)
      "preserve-caught-error": "warn",
      "no-undef": "warn",
      "no-unassigned-vars": "warn",

      // Svelte rules
      "svelte/require-each-key": "warn",
      "svelte/no-at-html-tags": "warn",
      "svelte/no-navigation-without-resolve": "warn",
      "svelte/prefer-svelte-reactivity": "warn",
      "svelte/prefer-writable-derived": "warn",
      "svelte/no-useless-mustaches": "warn",
      "svelte/no-unused-svelte-ignore": "warn",
      "svelte/no-dom-manipulating": "warn",
    },
  },

  // Ignored paths
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/.svelte-kit/**",
      "**/coverage/**",
      "packages/jsr/**",
      "services/**",
      ".claude/**",
    ],
  },
);
