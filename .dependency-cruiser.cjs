// Architecture rules for the monorepo (testing runway tier A).
//
// Tutors is a hexagonal architecture (docs/adr/0001-hexagonal-architecture.md): three rings,
// with every dependency pointing inwards.
//
//   domain       packages/domain                    the rules of a course, learning, presence, access
//   application  packages/application               ports and use cases; imports the domain only
//   adapters     packages/adapters/driven/<name>    one technology each, behind a port
//                packages/adapters/driving/<name>   Svelte state, UI, themes, i18n, a11y, tour
//   apps         apps/<name>                        composition roots: compose(env) picks the adapters
//
// packages/platform/* (logger, metrics) are plumbing any adapter or app may use; packages/jsr/*
// are the published packages: facades over the rings (model, time, types, identity) and the
// authoring toolchain (gen, tutors, tutors-lite, create).
//
//   pnpm test:runway                 # the gate: fails on new violations or stale baseline entries
//   pnpm architecture-report         # every violation, including the known ones
//
// Negative fixtures for every rule live in tests/architecture/fixtures/workspace.

const DOMAIN = "^packages/domain/";
const APPLICATION = "^packages/application/";
const RINGS = "^packages/(domain|application)/";
const DRIVEN = "^packages/adapters/driven/";
const DRIVING = "^packages/adapters/driving/";
const PLATFORM = "^packages/platform/";
const FACADES = "^packages/jsr/(model|time|types|identity)/";

/** A workspace root: apps/x, packages/jsr/x, packages/platform/x, packages/adapters/driven/x, packages/adapters/driving/x, packages/domain or packages/application. */
const WORKSPACE = "^((?:apps|packages/jsr|packages/platform|packages/adapters/driven|packages/adapters/driving)/[^/]+|packages/domain|packages/application)/";

/**
 * Each vendor and the one driven adapter allowed to import it. Everything else talks to the
 * port. A vendor used by an app directly is the app's own composition decision.
 */
const VENDORS = [
  { name: "supabase", match: "(^|/)@supabase/", adapter: "^packages/adapters/driven/(store-supabase|realtime-supabase)/" },
  { name: "markdown", match: "(^|/)(markdown-it|katex|shiki|mermaid|@marp-team)(/|$)", adapter: "^packages/adapters/driven/render-markdown/" },
  { name: "better-auth", match: "(^|/)(@better-auth/|better-auth(/|$))", adapter: "^packages/adapters/driven/identity-better-auth/" }
];

/** The authoring toolchain (generator and CLIs) is published on its own and is not an adapter of the reader; its extraction is a separate phase. */
const AUTHORING = "^packages/jsr/(gen|tutors|tutors-lite|create)/";

const vendorRules = VENDORS.map((vendor) => ({
  name: `vendor-only-in-its-adapter`,
  comment: `${vendor.name} belongs to its driven adapter (${vendor.adapter}); everything else calls the application port. An app may compose it directly.`,
  severity: "error",
  from: { path: "^packages/", pathNot: `${vendor.adapter}|${AUTHORING}` },
  to: { path: vendor.match }
}));

/** The driving adapters' own layering: primitives -> navigators -> components -> apps, one direction only. */
const UI_LAYERS = ["packages/adapters/driving/ui-primitives", "packages/adapters/driving/ui-navigators", "packages/adapters/driving/ui-components", "apps/[^/]+"];
const uiLayerRules = UI_LAYERS.slice(0, -1).map((layer, index) => ({
  name: "ui-layering",
  comment: `${layer} must not import from a UI layer above it (${UI_LAYERS.slice(index + 1).join(", ")}).`,
  severity: "error",
  from: { path: `^${layer}/` },
  to: { path: `^(${UI_LAYERS.slice(index + 1).join("|")})/` }
}));
uiLayerRules.push({
  name: "ui-layering",
  comment: "The service packages the UI reads (svelte-state, themes, i18n, a11y, tour, privacy) sit below the UI packages and import none of them.",
  severity: "error",
  from: { path: `${DRIVING}(svelte-state|themes|i18n|a11y|tour|privacy)/` },
  to: { path: `${DRIVING}ui-` }
});

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-self-contained",
      comment: "The domain imports nothing: no other package, no npm module, no Node built-in, no framework. It is the rules of Tutors and runs anywhere.",
      severity: "error",
      from: { path: DOMAIN },
      to: { pathNot: DOMAIN }
    },
    {
      name: "application-imports-domain-only",
      comment: "The application ring (ports and use cases) imports the domain and nothing else; every technology sits behind a port.",
      severity: "error",
      from: { path: APPLICATION },
      to: { pathNot: RINGS }
    },
    ...vendorRules,
    {
      name: "no-adapter-to-adapter",
      comment: "A driven adapter imports the application ports, the domain, the platform plumbing and its one technology; never another adapter. Two adapters that need each other share a port.",
      severity: "error",
      from: { path: `${DRIVEN}([^/]+)/` },
      to: { path: "^packages/adapters/", pathNot: `${DRIVEN}$1/` }
    },
    {
      name: "svelte-state-imports-no-adapter",
      comment: "svelte-state is the driving adapter the UI reads; it calls use cases through configured ports and imports no other adapter (the theme registers itself through a seam).",
      severity: "error",
      from: { path: `${DRIVING}svelte-state/` },
      to: { path: "^packages/adapters/", pathNot: `${DRIVING}svelte-state/` }
    },
    {
      name: "adapters-import-no-app",
      comment: "Apps are the composition roots; nothing below them imports an app.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" }
    },
    ...uiLayerRules,
    {
      name: "ui-primitives-no-data-features",
      comment:
        "UI primitives are low-level presentational components: they take users, events and permissions as props or context, and never reach into the state adapter's data and access services (community, connect, rbac) themselves. Theme and tour services stay allowed.",
      severity: "error",
      from: { path: `${DRIVING}ui-primitives/` },
      to: { path: `${DRIVING}svelte-state/src/(community|connect|rbac)/` }
    },
    {
      name: "platform-self-contained",
      comment: "Platform plumbing (logger, metrics) imports no ring, adapter, facade or app.",
      severity: "error",
      from: { path: PLATFORM },
      to: { path: "^(apps|packages)/", pathNot: PLATFORM }
    },
    {
      name: "facades-import-rings-only",
      comment:
        "The published packages model-lib, time-lib, tutors-types and identity are facades: they re-export the rings (model-lib also the markdown renderer) and import no other adapter, platform package or app.",
      severity: "error",
      from: { path: FACADES },
      to: { path: "^(apps|packages)/", pathNot: "^(packages/domain|packages/application|packages/jsr|packages/adapters/driven/render-markdown)/" }
    },
    {
      name: "tutors-types-self-contained",
      comment:
        "@tutors/tutors-types is the vocabulary every layer shares: it re-exports the domain's and imports nothing else, no other workspace, no npm package, no Node built-in (Rule 0130).",
      severity: "error",
      from: { path: "^packages/jsr/types/" },
      to: { pathNot: "^(packages/jsr/types|packages/domain)/" }
    },
    {
      name: "identity-provider-only-in-adapter",
      comment: "Better Auth belongs to the identity adapter; consumers depend on identity contracts.",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "(^|/)(@better-auth/|better-auth(/|$))" }
    },
    {
      name: "identity-contracts-self-contained",
      comment: "Identity contracts are the identity port: they import the domain's actor and the application's ports, and no framework, database or provider.",
      severity: "error",
      from: { path: "^packages/jsr/identity/" },
      to: { pathNot: "^(packages/jsr/identity|packages/domain|packages/application)/" }
    },
    {
      name: "identity-no-server-in-browser",
      comment: "Browser entry points cannot reach server adapters or private environment modules, even through a shared barrel.",
      severity: "error",
      from: { path: "(\\.svelte$|\\.client\\.[jt]s$|/\\+(page|layout)\\.[jt]s$|^packages/adapters/driven/identity-better-auth/src/client\\.ts$)" },
      to: { path: "(\\.server\\.[jt]s$|/server/|\\$env/(static|dynamic)/private|\\$app/env/private|(^|/)(?:better-auth/(?:dist/)?(?:auth/|api/|cookies/|integrations/|index\\.)))", reachable: true }
    },
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
        "A cycle that leaves a workspace and comes back makes the rings meaningless; invert one edge through a port or seam. Cycles inside one package (a recursive component, for instance) are allowed.",
      severity: "error",
      from: { path: WORKSPACE },
      to: { circular: true, viaSomeNot: "^$1/" }
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      // Workspace build output and tests are out; node_modules stays in the graph (unfollowed) so a
      // vendor import is an edge the vendor rules can see.
      path: "(^|/)(\\.svelte-kit|__tests__|test|tests)/|^(apps|packages)/((?!node_modules/).)*/(build|dist)/|\\.(test|spec)\\.ts$"
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
