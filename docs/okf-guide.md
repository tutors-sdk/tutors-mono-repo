# Open Knowledge Format (OKF) for Tutors

This project includes an OKF v0.2 knowledge bundle generator that catalogs the Tutors monorepo for consumption by LLMs, AI agents, and markdown-based tools.

## What is OKF?

OKF is an open, vendor-neutral specification from Google Cloud for representing knowledge as **plain markdown files with YAML frontmatter** in a directory hierarchy.

Key properties:

- **No SDK required** — standard markdown with YAML frontmatter, readable by any tool (Obsidian, MkDocs, GitHub, LLMs).
- **Provenance built in** — every concept records who generated it, when, and from what source.
- **Progressive disclosure** — `index.md` files at each level let agents navigate one layer at a time instead of loading everything.

## Bundle structure

The generated bundle lives in `okf/` (gitignored, generated locally):

    okf/
      index.md              # Bundle root (okf_version: "0.2")
      log.md                # Generation changelog
      packages/
        index.md            # All workspace packages
        tutors-model-lib.md # One concept per package
        ...
      components/
        index.md            # All Svelte UI components
        card.md             # One concept per component with props
        ...
      routes/
        index.md            # All SvelteKit routes by app
        reader-root.md      # One concept per route
        ...
      types/
        index.md            # Core types from tutors-model-lib
        lo.md               # One concept per type with fields
        ...
      schemas/
        index.md            # Supabase and API schemas
        learning-record.md  # One concept per Zod schema
        ...
      services/
        index.md            # Application services
        analytics.md        # One concept per service with methods
        ...

## Concept types

| Type | Describes | Key metadata |
|------|-----------|-------------|
| Tutors Package | Workspace package or app | exports, dependencies, scripts |
| Tutors Component | Svelte 5 component | props table, snippets |
| Tutors Route | SvelteKit route | path, params, load/SSR config |
| Tutors Type | TypeScript type/interface | fields table with types |
| Tutors Schema | Zod data schema | fields table, required flags |
| Tutors Service | Application service | method list, package |

## How to use the bundle

### With an LLM or AI agent

Load concept files directly into context. Start with `okf/index.md` for an overview, drill into a section via `okf/<section>/index.md`, then read individual concepts. The progressive disclosure pattern keeps token usage efficient.

### As browsable documentation

Open in **Obsidian** as a vault, or serve with **MkDocs** / any static site generator.

### For programmatic consumption

Parse YAML frontmatter from any concept file to extract structured metadata. The `type` field distinguishes concept types.

## Regenerating the bundle

    pnpm generate:okf

The previous bundle is replaced on each run. Since `okf/` is gitignored, it must be regenerated locally.

## OKF specification reference

The bundle conforms to [OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md). See also the [Google Cloud blog post](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) introducing the format.
