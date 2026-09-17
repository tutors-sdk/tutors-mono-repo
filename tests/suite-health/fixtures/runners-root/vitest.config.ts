// Fixture: a Vitest runner that collects tests/**/*.spec.ts except tests/e2e.
export default {
  test: {
    include: ["tests/**/*.spec.ts"],
    exclude: ["tests/e2e/**"],
    coverage: { include: ["packages/**"] }
  }
};
