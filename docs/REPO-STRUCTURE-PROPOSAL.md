# Proposal: a repository root a newcomer can read

**Status:** discussion. Nothing has been moved. Circulated for maintainer comment.

## The problem

The root has **47 tracked entries — 15 directories and 32 files** (53 on disk with dotfiles). A
contributor's first view of the project is a wall that names no part of it. The layout is honest about
*packaging technology* (`packages/jsr`, `packages/svelte`) and silent about *what the project is*.
ARCHITECTURE.md compounds this: it opens by describing "4 distinct subsystems — JSR Packages, Svelte
Packages, Applications, Services", which is a build-tool partition, not an architecture. The actual
architecture — a pipeline from a folder of markdown to a rendered course — appears at line 1302.

Most levels below the root already behave (`apps/` 4, `packages/` 3, `deploy/` 3, `release/` 5). The
blown-out levels are root, `tests/` (17), `packages/svelte/` (12), `scripts/` (12), and `docs/` + `guides/`.

## The principle

> **Level 1 names the concerns of the project. Level 2 names the architecture within each concern.**

Familiar at the top, so a contributor arriving with `src / test / docs` in their head is not surprised.
Project-specific one level down, where they are ready for it. Four or five entries at any level.

```
src/         what ships
  format/       the course model — the contract both sides honour
  authoring/    CLI · Deno · JSR     a folder of markdown → tutors.json
  reading/      web · SvelteKit      tutors.json → a course site
  community/    web · opt-in         presence, live, time
docs/        the briefing, the specifications, the methodology
tests/       the evidence, and the thresholds that enforce it
operate/     containers, k8s, deploy, observability, migrations, release claims
tools/       scripts, configs, generators
```

Five directories, plus the ~9 root files that genuinely cannot move (`package.json`,
`pnpm-workspace.yaml`, `README.md`, `LICENSE`, lockfiles, and so on).

## Two claims this makes that the current layout does not

**1. The CLI/web seam is the first thing you learn.** Today it is a warning in prose — *"if you are
inside `packages/jsr/`, you are in Deno-land; everywhere else is pnpm"* — which only helps people who
read that paragraph. Under `src/` it is structural:

| | runtime | ships as | runs where |
|---|---|---|---|
| `src/authoring/` | Deno | JSR package | an author's laptop, CI |
| `src/reading/`, `src/community/` | Node | static site, container | a browser |
| `src/format/` | both | JSR package | the only thing each side imports |

**2. The engineering apparatus is part of the project, not clutter.** The repo carries **29 gate scripts,
12 CI workflows, 43 check/test/release npm scripts**, release claims, OpenVEX attestations, a11y
ratchets, and mutation and bundle floors. None of that is accidental. A 10-minute briefing on this
project's values has two halves — *educators own their content*, **and** *we make checkable claims about
what we ship* — and a root that pictures only the first misrepresents it. `tests/` and `operate/` stand
as peers of `src/` deliberately.

## What it costs

Close to nothing in depth, because `src/<concern>/` replaces `packages/<runtime>/`, which was already two
segments carrying less information:

- `packages/svelte/ui-navigators` → `src/reading/ui-navigators` — same depth
- `packages/jsr/model` → `src/format/model` — same depth
- `apps/reader` → `src/reading/reader` — **one deeper** (the only regression, and only for the 4 apps)

The real cost is a large path-rewriting commit: workspace globs, tsconfig paths, Vite aliases, CI
workflow paths, and every docs link. Mechanical, but wide, and it rewrites `git blame` surfaces.

## Open questions for maintainers

1. **`scripts/checks/` (29 files).** These are the enforcement arm of the test suite, not dev tooling.
   They arguably belong in `tests/`, making it the home of both the evidence and the thresholds. Agree?
2. **`tests/e2e-stack/`** has its own `compose.yaml`. Containerised, but it answers *"does it work"*
   rather than *"how do we run it"*. Proposed: stays in `tests/`.
3. **`supabase/migrations`** is community's schema but an operational artifact. Proposed: `operate/`.
4. **`catalogue`** is discovery, which precedes reading. Proposed: `src/reading/`, rather than inventing a
   fifth pipeline stage for one app.
5. **Is the apparatus advertised or tucked away?** If advertised, the root is as above. If it is machinery,
   `tests/` and `operate/` collapse into one `engineering/` and the root drops to four. Given we already
   publish OpenSSF Scorecard and Baseline badges, the recommendation is *advertised* — but this is a
   statement about the project's identity, not a technical call.

## Recommended sequencing

**Fix the map before moving the territory.** ARCHITECTURE.md documents `src/` and nothing else; there is
no single document that explains the assurance system. That gap is precisely why 29 gates and a
`claims.yaml` read as clutter rather than as a feature — they have never been introduced. Rewriting the
architecture overview around these five concerns is higher value than any file move, is reversible, and is
a prerequisite for the move making sense to anyone. If the prose lands and still reads true after a few
weeks, the move becomes mechanical.
