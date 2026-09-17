// Architecture rules for the monorepo (testing runway tier A).
//
// The layers below are the ones the README promises under "Architecture":
// foundation -> core -> feature -> ui-primitives -> ui-navigators ->
// ui-components -> apps, one direction only. A module may import from its own
// layer or any layer beneath it, never from a layer above.
//
//   pnpm test:runway                 # the gate: fails on new violations or stale baseline entries
//   pnpm architecture-report         # every violation, including the known ones
//
// Negative fixtures for every rule live in tests/architecture/.

/** Workspace directories per layer, lowest first. Keep in step with README.md. */
const LAYERS = [
  { name: "foundation", paths: ["packages/jsr/[^/]+", "packages/svelte/utils/logger", "packages/svelte/utils/metrics"] },
  {
    name: "core",
    paths: ["packages/svelte/runes", "packages/svelte/course", "packages/svelte/utils/a11y", "packages/svelte/utils/i18n"]
  },
  {
    name: "feature",
    paths: [
      "packages/svelte/themes",
      "packages/svelte/community",
      "packages/svelte/connect",
      "packages/svelte/utils/rbac",
      "packages/svelte/utils/privacy",
      "packages/svelte/utils/tour"
    ]
  },
  { name: "ui-primitives", paths: ["packages/svelte/ui-primitives"] },
  { name: "ui-navigators", paths: ["packages/svelte/ui-navigators"] },
  { name: "ui-components", paths: ["packages/svelte/ui-components"] },
  { name: "apps", paths: ["apps/[^/]+"] }
];

const anyOf = (paths) => `^(${paths.join("|")})/`;

/** A workspace root: apps/x, packages/jsr/x, packages/svelte/utils/x or packages/svelte/x. */
const WORKSPACE = "^((?:apps|packages/jsr|packages/svelte/utils|packages/svelte)/[^/]+)/";

const layerRules = LAYERS.slice(0, -1).map((layer, index) => ({
  name: `layer-${layer.name}`,
  comment: `The ${layer.name} layer must not import from a layer above it (${LAYERS.slice(index + 1)
    .map((l) => l.name)
    .join(", ")}). See the Architecture section of README.md.`,
  severity: "error",
  from: { path: anyOf(layer.paths) },
  to: { path: anyOf(LAYERS.slice(index + 1).flatMap((l) => l.paths)) }
}));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...layerRules,
    {
      name: "no-app-to-app",
      comment: "Apps are deployed separately; share code through a package instead of importing another app.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" }
    },
    {
      name: "no-cross-workspace-relative-import",
      comment:
        "Import another workspace by its package name (@tutors/...), not by a relative path into its source, so the dependency is declared in package.json and visible to pnpm.",
      severity: "error",
      from: { path: WORKSPACE },
      to: { dependencyTypes: ["local"], dependencyTypesNot: ["aliased"], pathNot: "^$1/" }
    },
    {
      name: "no-cross-package-cycle",
      comment:
        "A cycle that leaves a workspace and comes back makes the layering meaningless; invert one edge through a seam. Cycles inside one package (a recursive component, for instance) are allowed.",
      severity: "error",
      from: { path: WORKSPACE },
      to: { circular: true, viaSomeNot: "^$1/" }
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)(node_modules|\\.svelte-kit|build|dist|__tests__|test|tests)/|\\.(test|spec)\\.ts$"
    },
    tsPreCompilationDeps: true,
    // Workspace packages resolve through node_modules symlinks to their source.
    preserveSymlinks: false,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["svelte", "import", "types", "default"],
      mainFields: ["svelte", "module", "main", "types"],
      extensions: [".ts", ".js", ".svelte", ".d.ts", ".json"]
    },
    reporterOptions: {
      text: { highlightFocused: true }
    }
  }
};
