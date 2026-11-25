# `Proposal: a repository root a newcomer can read

**Status:** discussion. Nothing has been moved. Circulated for maintainer comment.

**Revised 4 November 2026** for the decision to retire Deno and JSR from the monorepo — see
[REPO_STRUCTURE_PLAN.md §7](./REPO_STRUCTURE_PLAN.md). That decision *strengthens* the layout
proposed here and *weakens* one of its two supporting arguments. Both effects are marked below
rather than quietly absorbed.

Companions: [REPO_STRUCTURE_PLAN.md](./REPO_STRUCTURE_PLAN.md) measures the repository and plans
the work; [REPO-STRUCTURE-COURSE.md](./REPO-STRUCTURE-COURSE.md) turns it into teaching material.

## The problem

The root has **54 tracked entries** — seven more than when this was first written a month ago, which
is itself the argument. A contributor's first view of the project is a wall that names no part of
it. Retiring Deno removes two of those entries (`deno.json`, `deno.lock`); the trend is otherwise
upward.

The layout is honest about *packaging technology* (`packages/jsr`, `packages/svelte`) and silent
about *what the project is*. ARCHITECTURE.md compounds this: it opens by describing "4 distinct
subsystems — JSR Packages, Svelte Packages, Applications, Services", which is a build-tool
partition, not an architecture — and one of those four subsystems is about to stop existing. The
actual architecture, a pipeline from a folder of markdown to a rendered course, appears at line
1334.

Most levels below the root already behave (`apps/` 4, `packages/` 3, `deploy/` 3, `release/` 5). The
blown-out levels are root, `tests/` (17), `packages/svelte/` (12), `scripts/` (12), and `docs/` + `guides/`.

## The principle

> **Level 1 names the concerns of the project. Level 2 names the architecture within each concern.**

Familiar at the top, so a contributor arriving with `src / test / docs` in their head is not surprised.
Project-specific one level down, where they are ready for it. Four or five entries at any level.

```
src/         what ships
  format/       the course model — the contract both sides honour
  authoring/    CLI · npm            a folder of markdown → tutors.json
  reading/      web · SvelteKit      tutors.json → a course site
  community/    web · opt-in         presence, live, time
docs/        the briefing, the specifications, the methodology
tests/       the evidence, and the thresholds that enforce it
operate/     containers, k8s, deploy, observability, migrations, release claims
tools/       scripts, configs, generators
```

Five directories, plus the ~9 root files that genuinely cannot move (`package.json`,
`pnpm-workspace.yaml`, `README.md`, `LICENSE`, the lockfile, and so on).

## Two claims this makes that the current layout does not

**1. The authoring/reading seam is the first thing you learn.** *(Weakened by the single-runtime
decision — restated honestly rather than dropped.)*

The original form of this claim leaned on a **runtime** divide: `packages/jsr/` was Deno-land,
everywhere else was pnpm, and only a paragraph of prose said so. With one runtime that divide
disappears, and with it the sharpest version of the argument.

What remains is still real, but it is about **position in the pipeline**, not about technology:

| | runs where | ships as | imports |
|---|---|---|---|
| `src/authoring/` | an author's laptop, CI | one npm CLI — `npx tutors` | `format` |
| `src/reading/`, `src/community/` | a browser, a server | a static site, a container | `format` |
| `src/format/` | both | an internal package | nothing |

A newcomer still has to learn that authoring and reading **never import each other and meet only at
`tutors.json`**. That is a genuine architectural fact which the current layout does not express. It
is simply a quieter reason for the move than "two runtimes live in this repository" was.

One wrinkle to be honest about: `tutors-create` is imported by the reader for the web Create wizard
(`apps/reader/package.json:44`), so `src/reading/` would depend on `src/authoring/` — against the
direction of the pipeline arrow. Either the scaffolding logic moves to `format/`, or the exception
is documented. It is small, but a layout that claims a clean seam should name its one leak.

**2. The engineering apparatus is part of the project, not clutter.** *(Strengthened — the
single-runtime decision makes the apparatus the dominant thing in the repository, not a co-equal
one.)*

The repo carries **54 files in `scripts/` of which 35 are gates, 14 CI workflows, 47
check/test/release npm scripts**, release claims, OpenVEX attestations, a11y ratchets, and mutation
and bundle floors. Measured in hand-written lines, **two-thirds of this repository is assurance
machinery rather than product** ([REPO_STRUCTURE_PLAN.md §6](./REPO_STRUCTURE_PLAN.md)). None of
that is accidental. A 10-minute briefing on this
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

### Retiring Deno removes the main obstacle

`packages/jsr/` was the one directory that could not simply be relocated: its nine packages were a
second workspace with their own manifests, lockfile, formatter, test runner and publish step, and
moving them meant keeping all of that working in a new location. Once they are ordinary pnpm
workspace members, **they are free to be placed by concern** — which is the move this proposal asks
for. The mapping falls out:

| Today | Proposed | Note |
|---|---|---|
| `packages/jsr/model`, `types` | `src/format/` | the contract both sides honour |
| `packages/jsr/gen` | `src/authoring/` | CLI-only; likely absorbed into the CLI rather than kept as a package |
| `packages/jsr/tutors`, `tutors-lite`, `create` | `src/authoring/cli` | three packages become one published CLI |
| `packages/jsr/time` | `src/community/` | consumed by the reader, Time and `data-api` |
| `packages/jsr/realtime` | `src/community/` | the port; its Supabase adapter joins it |
| `packages/jsr/identity` | `src/format/` or a foundation slot | a contracts-only package with no dependencies |

Net effect: nine packages become roughly four, and the directory whose name is about packaging
technology stops existing. The two moves are worth doing as **one commit**, since both rewrite the
same paths.

## Open questions for maintainers

1. **`scripts/checks/` (41 files, up from 29).** These are the enforcement arm of the test suite, not
   dev tooling. They arguably belong in `tests/`, making it the home of both the evidence and the
   thresholds. Agree?
2. **`tests/e2e-stack/`** has its own `compose.yaml`. Containerised, but it answers *"does it work"*
   rather than *"how do we run it"*. Proposed: stays in `tests/`. Its fixture builders currently run
   under Deno and are ported as part of the single-runtime work, so this directory is being touched
   anyway.
3. **`supabase/migrations`** is community's schema but an operational artifact. Proposed: `operate/`.
4. **`catalogue`** is discovery, which precedes reading. Proposed: `src/reading/`, rather than inventing a
   fifth pipeline stage for one app.
5. **Is the apparatus advertised or tucked away?** If advertised, the root is as above. If it is machinery,
   `tests/` and `operate/` collapse into one `engineering/` and the root drops to four. Given we already
   publish OpenSSF Scorecard and Baseline badges, the recommendation is *advertised* — but this is a
   statement about the project's identity, not a technical call.

## Recommended sequencing

**Fix the map before moving the territory.** ARCHITECTURE.md documents `src/` and nothing else; there is
no single document that explains the assurance system. That gap is precisely why 41 gates and a
`claims.yaml` read as clutter rather than as a feature — they have never been introduced. Rewriting the
architecture overview around these five concerns is higher value than any file move, is reversible, and is
a prerequisite for the move making sense to anyone. If the prose lands and still reads true after a few
weeks, the move becomes mechanical.

**One change to that order.** Retiring Deno is now the exception that should run ahead of the prose,
because it is the only item here that *deletes* rather than rearranges: a second workspace, a second
lockfile, a second formatter, a second test runner, a second publish path, and a whole architecture
tier whose only job was keeping two manifests in agreement. None of that needs the map fixed first,
and every line of it would otherwise have to be rewritten by the move. The order becomes:

1. Retire Deno and JSR ([plan §7](./REPO_STRUCTURE_PLAN.md)) — deletes, does not rearrange.
2. Rewrite ARCHITECTURE.md around the five concerns — reversible, and the real approachability win.
3. Move the files — one wide, mechanical commit, once the prose has settled.
