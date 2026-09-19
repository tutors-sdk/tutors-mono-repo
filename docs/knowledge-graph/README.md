# Knowledge graph

[`GRAPH_REPORT.md`](GRAPH_REPORT.md) is a whole-repo map made with [graphify](https://github.com/safishamsi/graphify). It combines two passes:

- a structural pass over the code (tree-sitter AST: imports, calls, exports)
- an LLM pass over the docs, guides, workflows, deploy manifests and images

graphify then clusters the result into communities, which are groups of files and symbols that link more to each other than to the rest of the repo. The report lists them with a short name.

Snapshot: 19 Sep 2026, `main` at `0d705cf`, graphify 0.9.64. The graph has 4,807 nodes, 9,028 edges and 297 communities.

## What the report is good for

- **Finding your way in.** "Community Hubs" and "Communities" group the repo by what files do, not by folder. Each community lists its members and a cohesion score between 0 and 1. A higher score means the members link to each other more tightly.
- **God nodes.** These are the most-connected symbols. Apart from test tooling (`vitest`, `readText()`, `REPO_ROOT`), they are the model types `Course` and `Lo`. That matches [ARCHITECTURE.md](../../ARCHITECTURE.md): almost everything depends on `@tutors/tutors-model-lib`.
- **Hyperedges.** These are flows that span several files and that no single import shows, such as the release-candidate flow, the course page load-and-render path, the RBAC content-lock flow and the shrink-only baseline files.
- **Knowledge gaps and suggested questions.** These list nodes with at most one connection, and edges the model could not classify with confidence (marked `AMBIGUOUS`). They are worth a look when you work on docs.

Every edge is tagged `EXTRACTED` (found directly in the source), `INFERRED` (the model's judgement, with a confidence score) or `AMBIGUOUS`. Treat `INFERRED` and `AMBIGUOUS` edges as leads, not facts.

## Known limits of this snapshot

- **Svelte components are only partly parsed.** 157 `.svelte` files hit tree-sitter syntax errors. Some `<script>` symbols come through, but type imports and template usage mostly do not. For example, 16 components `import type { Lo }`, yet the graph shows no `.svelte` file depending on `Lo`. Read the component layer as under-connected: a missing edge from a `.svelte` file is not evidence of no dependency.
- **SQL is not parsed.** The 3 migration files (`supabase/migrations/`, `packages/svelte/utils/rbac/sql/`) contributed nothing, because the optional `tree_sitter_sql` grammar was not installed.
- **Vendored bundles are excluded.** [`.graphifyignore`](../../.graphifyignore) skips `*.min.js` and `*.min.mjs`. Without it, the three copies of `pdf.worker.min.mjs` added about 10,000 nodes and swamped the real code.
- **Excluded or dropped files.** The `deploy/k8s/**/secrets.yaml.example` files are skipped by graphify's sensitive-file filter. Anything in `.gitignore` is excluded too.
- **Name-matched `indirect_call` edges are often wrong.** graphify guesses these 119 `INFERRED` edges by matching names: a bare identifier gets linked to whatever function has the same name. They cluster on common variable names. The worst case is `lo()`, a 3-line fixture helper in `tests/unit/model/lo-tree.test.ts`. It picked up 33 such edges from every line that mentions a variable called `lo` (`<Context lo={data.lo}>`, `{#each group.los as lo}`, `rbacService.isLoVisibleToStudent(lo)`). So the report ranks it as a bridge across 14 communities, and its suggested question about `lo()` is an artifact. 62 of the 119 edges point at helpers inside test files, which nothing can import. The real cross-cutting hub is the `Lo`/`Course` type in `packages/jsr/model/src/types/learning-objects.ts`: counting only `EXTRACTED` edges, it is used directly by 16 to 17 communities, from the generator through the model lib to the Svelte services. Before relying on an `indirect_call` edge, check the cited `source_location`.
- **Dangling edges.** 344 edges point at nodes outside the graph, mostly external npm and Deno packages. They were dropped when the graph was built.

## Regenerating

The raw graph (`graph.json`, about 5.5 MB) and the interactive view (`graph.html`, about 4.4 MB) are build output and are not committed. To produce them locally:

```sh
uv tool install "graphifyy[sql]"   # or: pipx install "graphifyy[sql]"
graphify install                   # adds the /graphify skill to your agent
```

Then, from the repo root, run `/graphify .` in Claude Code or another supported agent. Output lands in `graphify-out/`, which is gitignored. Copy `graphify-out/GRAPH_REPORT.md` over this directory's copy to refresh the snapshot.

The code pass needs no API key and costs nothing. The docs pass calls an LLM: this snapshot used about 700k tokens for 177 non-code files. After a full build, `graphify update .` refreshes only the code part, with no LLM calls. A full `/graphify . --update` also re-extracts docs that changed.

With `graphify-out/graph.json` present, you can also query the graph directly:

```sh
graphify query "how does a course get from markdown to the reader?"
graphify path "CourseBuilder" "Card.svelte"
graphify explain "rbacService"
```
