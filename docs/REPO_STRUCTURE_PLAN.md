# Repository structure: analysis and plan

**Status:** analysis, for discussion. Nothing has been moved.
**Date:** 4 November 2026, against `main` at 17.1.0.

This document exists to serve three goals:

1. **Simplify the monorepo** so that its structure matches what the project actually is.
2. **Lower the barrier to contributing**, across a range of skill levels and disciplines.
3. **Support a Tutors course** introducing the technology and architecture behind Tutors.

Two companion documents:

- [REPO-STRUCTURE-PROPOSAL.md](./REPO-STRUCTURE-PROPOSAL.md) proposes a specific root layout. Its
  closing advice — *fix the map before moving the territory* — is reaffirmed here, and the
  measurements below explain why.
- [REPO-STRUCTURE-COURSE.md](./REPO-STRUCTURE-COURSE.md) carries goal 3: the seven-topic course
  outline, which was section 9 of this document until it outgrew it.

---

## 1. The map, and why the current map misleads

The repository presents itself as four subsystems: **JSR packages, Svelte packages, Applications,
Services**. That is a *packaging* partition, not an architecture. The architecture is a pipeline,
and it first appears in [ARCHITECTURE.md](../ARCHITECTURE.md) at line 1334 — roughly 1,300 lines in.

The real shape is four stages across **two runtimes**:

| Stage | Where it lives | Runtime | Ships as |
|---|---|---|---|
| **format** — the course model, the contract both sides honour | `packages/jsr/model`, `packages/jsr/types` | both | JSR package |
| **authoring** — a folder of markdown becomes `tutors.json` | `packages/jsr/gen`, `create`, `tutors` | **Deno** | JSR package; runs on an author's laptop and in CI |
| **reading** — `tutors.json` becomes a course site | `apps/reader`, `packages/svelte/ui-*`, `packages/svelte/course` | **Node** | static site, container |
| **community** — presence, live, time, discovery (opt-in) | `apps/live`, `apps/time`, `apps/catalogue`, `packages/svelte/community`, `connect` | **Node** | site plus Supabase |

### The seam is the first thing to learn, and it is being removed

The most important fact for a newcomer today is the **Deno/JSR to Node/pnpm seam**, and it exists
only as prose: *"if you are inside `packages/jsr/`, you are in Deno-land; everywhere else is pnpm."*
The repository carries two package managers, two lockfiles (`deno.lock`, `pnpm-lock.yaml`) and two
workspace definitions (`deno.json`, `pnpm-workspace.yaml`), and nothing structural tells a
contributor which world a file belongs to.

It is, however, a **tooling** seam rather than a source-code one. The production source of all nine
packages under `packages/jsr/` uses no Deno API at all: it imports `node:fs`, `node:path`,
`node:process`, `node:url` and `node:os`, and every `Deno.*` reference in the repository sits in two
test files. [Section 7](#7-single-runtime-retiring-deno-and-jsr) takes the consequence — the seam is
retired rather than made structural.

### Layering is enforced, and nearly invisible

`.dependency-cruiser.cjs` defines a real layer order:

```
foundation → core → feature → ui-primitives → ui-navigators → ui-components → apps
```

with named rules on top of it, including `no-app-to-app`, `no-cross-package-cycle`,
`no-database-client-in-browser-code`, `no-cross-workspace-relative-import` and
`ui-primitives-no-data-features`. This is good design that almost nobody encounters until it fails
them.

---

## 2. Build

Plain **pnpm workspaces with Vite and SvelteKit**. There is no Turbo and no Nx; build ordering comes
from pnpm's dependency syntax:

```
pnpm build   →   pnpm --filter tutors-reader... build
```

Shared configuration is centralised in one small package, `@tutors/app-config` (112 lines across
`vite.js`, `svelte.js`, `env.js`). This is one of the better pieces of design in the repository:

- `env.js` is the **single declaration of every environment variable** the apps may read.
- It uses SvelteKit's **dynamic** env, read at startup rather than baked at build time, which is why
  one container image can serve every environment and no secret is ever in a layer.

A single `Dockerfile` builds all four apps, selected by `--build-arg APP_NAME=<reader|catalogue|live|time>`,
on a Node base pinned by digest.

---

## 3. Testing: the runway

This is the largest and best-documented part of the repository. Tiers **A to O** (there is no E),
each owning exactly one failure class, under two stated rules:

> One owning tier per failure class. No tier without a negative fixture.

The full map is in [guides/testing/TESTING-OVERVIEW.md](../guides/testing/TESTING-OVERVIEW.md) and
[tests/TESTING.md](../tests/TESTING.md). In concrete terms the estate includes:

- **66 feature files carrying 349 EARS `Rule:` blocks**, bound to product code
- property and fuzz suites, with a timezone matrix
- contract snapshots of every public JSR export (`etc/*.api.md`)
- mutation testing with per-module floors
- migration tests against a real Postgres via PGlite
- kubernetes conformance, container smoke, bundle ceilings, Lighthouse floors, axe ratchets

### The ratchet is the central mechanism

Nine baseline files hold problems that existed on day one. The rule is the same for all of them:

- a problem **not** in the baseline fails the build
- a baseline line that **no longer occurs** also fails the build
- therefore fixing something means deleting its line, and baselines may only shrink

Coverage floors work the same way: below the floor fails, and sitting 2 or more points *above* a
floor also fails, which forces the floor upward.

There are **no git hooks**. The first gate is the pull request.

---

## 4. Continuous integration

`.github/workflows/ci.yml` is 590 lines and 12 jobs, converging on a single required check,
**`CI success`**, which treats a skipped or cancelled job as a failure. Because it is the one
required status check in the ruleset on `main`, adding a job to its `needs` extends the gate without
touching repository settings. This is a genuinely elegant arrangement.

Fourteen workflows in total: CI, CodeQL, Scorecard, Zizmor, nightly, changelog hint, image build,
deploy, deploy-pin, and four release and release-candidate workflows.

---

## 5. Release and deployment: three stories, one of them real

This is where the repository's coherence breaks down, and it has already caused a production outage.

| Path | What it does | Reality |
|---|---|---|
| **A. Netlify from a branch** | `netlify.toml` per app; a Netlify site is pointed at a `release/X.Y.Z` branch | **This is production.** |
| **B. Images to Quay, then kubernetes** | `image-build.yml` publishes signed images with SBOM and SLSA provenance; `pnpm deploy:pin` rewrites four kustomize overlays and `release/deployed.json` by digest; `deploy.yml` verifies every tag resolves to a signed digest; an `announce` job runs in a gated `production` environment | Fully built, and **not what serves users** |
| **C. The release harness** | a push to `release/**` tags `vX.Y.Z-rc.N`, builds candidate images and dispatches to `tutors-sdk/tutors-release-harness`, which diffs production against the candidate across ~25 artefact types, every difference matched against `release/claims.yaml` | `HARNESS_TOKEN` is unset, so **nothing is judged** |

### The 17.1.0 outage is the worked example

Release 17.1.0 moved signed-in student data from the browser to the reader's own server, which made
`PRIVATE_SUPABASE_SERVICE_ROLE_KEY` a newly required variable — it appears zero times in v17.0.0 and
in 17 files at 17.1.0. Without it, `serviceClient()` returns null and every `/api` route answers 503,
so the favourites dashboard failed for every signed-in user.

The release **did** carry an operator note, in [CHANGELOG.md](../CHANGELOG.md):

> Deploy with `PRIVATE_SUPABASE_SERVICE_ROLE_KEY` (a Secret, never a `PUBLIC_` variable) and
> `PRIVATE_API_ALLOWED_ORIGINS`; see guides/SERVER-WRITES.md. Apply the anon-access revocation after
> the new pods are serving traffic.

**There are no pods.** The one note that would have prevented the outage was written for deployment
path B, while production runs on path A. The release machinery is sophisticated, and aimed at a
target that does not exist.

---

## 6. What the measurements say

Hand-written lines, excluding `node_modules`, `.svelte-kit` and build output such as
`apps/live/.netlify/`:

| Area | Lines | Share |
|---|---|---|
| Product source (`apps/*/src` plus `packages/*/src`) | **29,239** | 34% |
| Tests (`tests/`, `apps/reader/tests`) | 43,613 | 51% |
| Repository tooling (`scripts/`; 35 of its 53 files are gates) | 13,011 | 15% |

**Two-thirds of the hand-written code in this repository is assurance machinery rather than
product.** `tests/bdd` alone, at 17,701 lines, is comparable to every JSR and Svelte package
combined (22,506). The reader — the actual product — is 3,707 lines.

That ratio is not self-evidently wrong. It is, however, the single fact that determines whether
contributing feels approachable, and it is currently unexplained: there is no document that
introduces the assurance system as a system. That absence is exactly why 35 gate scripts and a
`claims.yaml` read as clutter instead of as the project's second value proposition.

### Package sprawl

There are 30 workspace packages. **Eleven are under 150 lines of source:**

| Package | Lines |
|---|---|
| `jsr/identity` | 19 |
| `svelte/utils/a11y` | 19 |
| `jsr/tutors-lite` | 34 |
| `svelte/realtime-supabase` | 34 |
| `svelte/runes` | 69 |
| `svelte/utils/privacy` | 87 |
| `svelte/app-config` | 112 |
| `svelte/utils/runtime` | 127 |
| `svelte/identity-sveltekit` | 137 |
| `svelte/utils/metrics` | 137 |
| `svelte/data-api` | 145 |

Each carries a `package.json`, a build step, a tsconfig, a node in the dependency graph, and a
decision every contributor must make about where their code belongs.

### How these numbers were produced

So they can be re-derived as the repository changes:

```bash
# product source
find apps/*/src packages/*/*/src packages/svelte/utils/*/src -type f \
  \( -name "*.ts" -o -name "*.svelte" -o -name "*.js" \) -exec cat {} + | wc -l

# tests and tooling
find tests apps/reader/tests -type f \( -name "*.ts" -o -name "*.feature" -o -name "*.mjs" \) \
  -not -path "*/node_modules/*" -exec cat {} + | wc -l
find scripts -type f -name "*.ts" -exec cat {} + | wc -l

# EARS rules
grep -rh "^\s*Rule:" tests/bdd/features --include="*.feature" | wc -l
```

Counts exclude `node_modules`, `.svelte-kit`, `dist` and `.netlify`. Build output inflates a naive
count of `apps/` roughly tenfold, so it must be excluded.

---

## 7. Single runtime: retiring Deno and JSR

**Decision, 4 November 2026.** The monorepo becomes Node-and-pnpm only. The authoring CLI is
published to **npm**; every other package becomes **internal**. JSR publication moves to a separate,
minimal repository, retained indefinitely so that **every existing course keeps building, unchanged
and unbroken**, and can still be fixed. No Deno reference remains in this repository.

### Why this costs far less than the structure implies

Every `Deno.*` reference in `packages/jsr/`:

| API | Count | Where |
|---|---|---|
| `Deno.test` | 32 | `tutors-lite/test/run.test.ts`, `create/test/scaffolder.test.ts` |
| `Deno.makeTempDirSync` | 2 | `tutors-lite/test/run.test.ts` |
| `Deno.Command`, `Deno.execPath` | 2 | `tutors-lite/test/run.test.ts` |

All of it is in **two test files**. The production source is already Node-idiomatic.

Six of the nine packages — `model`, `types`, `time`, `identity`, `realtime`, `create` — already
carry a `package.json`, are already pnpm workspace members, and are already consumed by the apps as
`workspace:*`. The Node half of the repository never resolves anything through JSR. Only `gen`,
`tutors` and `tutors-lite` are Deno-only in their packaging: exactly the authoring CLI chain.

### What is published, and to whom

JSR carries **no external library consumers**. Its only real traffic is the course build command,
which a small majority of published courses still use, emitted by
`packages/jsr/create/src/templates.ts:106`:

```toml
[build]
  command = "deno run -A jsr:@tutors/tutors"
```

Those repositories belong to educators and cannot be edited. They do not need to be. **No existing
course breaks, and none has to change.** The two commands coexist indefinitely:

| Course | Build command | Served by | Status |
|---|---|---|---|
| **Existing** — a small majority of published courses | `deno run -A jsr:@tutors/tutors` | the compatibility repository's JSR package, delegating to npm | keeps working, unchanged, with no action by the educator |
| **Newly generated** — from the scaffolder, after step 3 | `npx tutors` | npm directly | the future path |

Because the compatibility package delegates to npm by semver range rather than carrying its own
copy of the generator, an existing course on the old command receives **the same generator, and the
same fixes**, as a new one. The two paths differ in how the code is fetched, not in what runs. That
is what makes the old command safe to leave in place rather than something to deprecate on a clock.

The npm name is already held: **`tutors` is an existing package of this project's** — maintainer
`edeleastar`, created 2016, last published as 1.6.4 in June 2022, described as "Static course web
site generator". Publishing the current CLI there as 5.x resumes a dormant package rather than
claiming a new one, needs no scope, and leaves any ancient `tutors@^1` pin undisturbed. It also
tilts open question 5 toward a single command with subcommands — `npx tutors`, `npx tutors lite`,
`npx tutors create` — since the short unscoped name is available to use.

### The compatibility repository

A separate repository keeps the two JSR specifiers that existing courses name — `@tutors/tutors`
and `@tutors/tutors-lite` — alive, each delegating to the single npm CLI:

```ts
// @tutors/tutors — main.ts
import "npm:tutors@^5";              // the default export runs dynamic generation

// @tutors/tutors-lite — main.ts
import "npm:tutors@^5/static";       // the static subcommand's entry point
```

This is the one place the one-CLI decision reaches outside the monorepo: the npm package needs a
**subpath export per legacy command**, so each old specifier has something to point at. That is a
`package.json` `exports` entry, not a second artifact.

Deno resolves `npm:` specifiers natively, so the old commands keep running the current generator
with no copy of the source, no build step and no version lockstep to maintain. The repository is
written once and touched only on a major bump: an ordinary fix published to npm reaches both old
commands automatically through the semver range.

Two things to confirm before relying on it: that `deno publish` accepts an entry point whose only
statement is an `npm:` import, and that Deno's npm resolution works inside Netlify's build image.

### What leaves this repository

Larger than deleting nine manifests, because Deno reaches into the test estate:

| What | Where | Action |
|---|---|---|
| Workspace, format and task config | `deno.json`, `deno.lock` | delete |
| Per-package manifests | 9 × `packages/jsr/*/deno.json` | delete |
| Deno tests | `tutors-lite/test/run.test.ts`, `create/test/scaffolder.test.ts` | port to vitest; `Deno.Command(Deno.execPath())` becomes `node:child_process` |
| **Manifest parity tier** | `tests/architecture/manifest-parity.test.ts`, `known-manifest-drift.txt` | **delete** — it exists only to keep `deno.json` and `package.json` in step |
| Fixture builders | `tests/e2e-stack/fixture-course/build.ts`, `build-signed-in.ts`, `tests/fixtures/tutors-json-history/build.ts` | run under Node; update `package.json:32` |
| Release scripts and comparators | 9 files under `tests/release/` | drop the Deno branches |
| Runner policy | `tests/suite-health/suite-health.test.ts` and its `runners-root` fixture | drop the Deno runner case |
| CI | `ci.yml`, `nightly.yml`, `release-testing.yml`, `rc-validation.yml` | remove the Deno setup steps |
| Aliases and tooling | `vitest.aliases.ts`, `vitest.config.mutation.ts`, `playwright.e2e-stack.config.ts`, `knip.json`, `.prettierignore`, `.editorconfig` | repoint |
| Documentation | `ARCHITECTURE.md` (527, 576, 615–636, 1349, 1391, 1875), `tests/TESTING.md`, `tests/release/RELEASE-TESTING.md` | rewrite |
| EARS features | `developer/shared-types.feature`, `course/course-json-history.feature`, `generator/static-build.feature` | review the Rules, keep the ids |
| Directory | `packages/jsr/` | rename; the name becomes false |

Deleting the manifest-parity tier is a tier removal, so it needs the runway's usual argument. It
holds: the failure class it owns — two manifests for one package disagreeing — ceases to exist.

### The contract snapshots

`etc/` holds six: `identity`, `realtime`, `tutors-gen-lib`, `tutors-model-lib`, `tutors-time-lib`,
`tutors-types`. All six are libraries, so under this decision **none of them covers a published
artifact**. Their stated purpose — guarding every public JSR export — no longer applies.

They remain useful as internal change detection across a thirty-package graph, so the recommendation
is to keep them and rewrite the rationale rather than delete them. Removing them would be a
measurable reduction in the assurance machinery section 6 counts, and should be a deliberate call.

### What ships to npm

**One CLI**, covering both generators and the scaffolder. Three packages today become three
subcommands of one published artifact:

| Command | Replaces | What it does |
|---|---|---|
| `npx tutors` | `jsr:@tutors/tutors` | **dynamic** generation — `generateDynamicCourse` writes `json/`, read by the tutors.dev reader |
| `npx tutors static` | `jsr:@tutors/tutors-lite` | **static** generation — Vento templates render a self-contained, offline `html/` folder |
| `npx tutors create` | `jsr:@tutors/tutors-create` | interactive scaffolder for a new course |

The bare `npx tutors` **must keep meaning dynamic generation with no argument**, because that is
what today's command does and what goes into the scaffolder's `netlify.toml`. Dynamic is the
default subcommand, not a word anyone has to type.

The author-facing command improves on its own merits — no runtime install on Netlify, which already
ships Node, and no `-A` permission flag to explain:

```toml
command = "npx tutors"
```

Supporting packages:

- `@tutors/tutors-create` is **both shipped and internal**: `apps/reader/package.json:44` imports it
  for the web Create wizard, so it stays a workspace package *and* feeds the `create` subcommand.
- `gen` is **CLI-only** — nothing in `apps` or `packages/svelte` imports it. It can be absorbed into
  the CLI rather than kept as a package.
- `model` is the only straddler, shared by the CLI and the reader.

Publish **bundled**. `gen` pulls markdown-it with ten plugins, plus shiki, marp-core and archiver; a
course build should fetch one tarball rather than resolve that tree on every push.

### Two traps in the consolidation

Both are cheap to handle if known in advance, and both break quietly if not.

**The Vento templates must be packaged as assets.** `packages/jsr/tutors-lite/main.ts:12` resolves
them relative to the module, at `../gen/src/templates/vento`, and when that path does not exist it
falls back to **downloading templates from GitHub `main`**. A bundler will not carry a directory
resolved by runtime path arithmetic, so unless the templates ship inside the package, every static
build silently renders against whatever is on `main` rather than against the released version.

**The version string has three sources today, and they already disagree.** `tutors/main.ts:8`
imports its version from `./deno.json`; `tutors-lite/main.ts:7` hardcodes `5.0.9` while its
`deno.json` says `5.3.0`. One CLI reading one `package.json` fixes an existing drift bug for free.

### Sequence

1. **Publish the CLI to npm**, bundled.
2. **Create the compatibility repository**, publish from it to JSR, and verify a real course builds
   against it.
3. **Change the scaffolder template** at `packages/jsr/create/src/templates.ts:106` to `npx tutors`,
   so every newly generated course takes the npm path.
4. **Remove Deno from this repository**, per the table above.

Steps 1 and 2 must precede step 4, so that no window exists in which the old command resolves to
nothing. Step 3 is independent of the rest and can land first; it is one line and reversible.

There is no step 5. Migrating existing courses is **optional and unhurried** — its only purpose is
to let the compatibility repository be retired one day, not to avert a failure. If it is ever worth
doing, the levers are a one-line `netlify.toml` pull request to course repositories and a notice
from the reader to educators still on the old command. Neither is on a clock.

### The payoff

One package manager, one lockfile, one test runner, one formatter. The two-runtime fact that
section 1 identifies as the hardest thing for a newcomer to learn stops being true. Much of Priority
3 below arrives with it, since the nine packages under `packages/jsr/` become ordinary workspace
members free to move to wherever they belong by concern.

---

## 8. The plan

Three independent workstreams, in value order. Each is useful on its own. Section 7's single-runtime
migration runs alongside them and overlaps heavily with Priority 3.

### Priority 1 — Reconcile the deployment story

The highest-value fix for coherence, and the only one with a demonstrated cost in outages.

- Write the **Netlify-from-a-branch** path down as *the* production path, in `deploy/README.md` and
  in [guides/Release-Strategy.md](../guides/Release-Strategy.md).
- Correct the changelog's operator vocabulary: no pods, no rollout; Netlify environment variables and
  a redeploy.
- Add a **required-environment-variable diff** to release preparation. Any variable newly read by the
  apps since the deployed tag should appear in the changelog under a `#### Deployment` heading, in
  the same way migrations now appear under `#### Database`. `packages/svelte/app-config/src/env.js`
  is a single file, so this check is cheap and mechanical.
- Decide the fate of paths B and C: connect them to reality, or retire them. Keeping a signed-image,
  kustomize and harness pipeline that serves no users costs CI minutes, misleads the changelog, and
  has caused at least one outage.

### Priority 2 — Fix the map before moving the territory

Rewrite [ARCHITECTURE.md](../ARCHITECTURE.md) around the five concerns rather than the four
packaging buckets:

```
format / authoring / reading / community   +   the assurance system
```

Two things it must do that no current document does:

1. Put the **pipeline** first, with the table from section 1 above. Once section 7 lands, the
   Deno/Node seam that table documents no longer needs explaining — which is the point.
2. Add the missing chapter: **the assurance system**, introducing the runway tiers, the ratchet
   pattern, EARS rules and release claims as deliberate design, not as clutter.

This is reversible, costs no path rewriting, and is a prerequisite for any file move making sense to
anyone. It delivers most of the approachability benefit on its own.

### Priority 3 — Then, and only then, move files

The layout in [REPO-STRUCTURE-PROPOSAL.md](./REPO-STRUCTURE-PROPOSAL.md) stands. Two additions the
measurements support:

- **Consolidate the eleven sub-150-line packages.** Most of `svelte/utils/*` is plausibly one
  `utils` package. Fewer, better-named packages make the dependency graph teachable. Section 7
  contributes directly: once `packages/jsr/` is gone, `gen` folds into the CLI and the remaining
  eight become ordinary workspace members, free to move by concern.
- Treat the move as mechanical and wide: workspace globs, tsconfig paths, Vite aliases, CI workflow
  paths, and every documentation link. It rewrites `git blame` surfaces, so it wants to be one
  commit, after the prose has settled.

---

## 9. A course on the technology behind Tutors

Moved to its own document: **[REPO-STRUCTURE-COURSE.md](./REPO-STRUCTURE-COURSE.md)**.

Seven topics at computer science undergraduate level, each with the same three-unit shape —
foundations, then the system, then a lab. Its relevance here is that the two efforts are the same
work from different ends: the topics the course finds hardest to place are exactly the concerns
this plan is trying to make visible, and topics 1 and 6 carry the project identity that the current
layout hides most effectively.

---

## 10. Open questions

Carried forward from [REPO-STRUCTURE-PROPOSAL.md](./REPO-STRUCTURE-PROPOSAL.md), still unanswered:

1. Do `scripts/checks/` belong under `tests/`, making it the home of both the evidence and the
   thresholds?
2. Does `supabase/migrations` belong with operations rather than with community code?
3. Is the engineering apparatus **advertised** as a peer of the source, or tucked away as machinery?
   Given that the project already publishes OpenSSF Scorecard and Baseline badges, the
   recommendation is *advertised* — but that is a statement about the project's identity, not a
   technical call.

And one new question raised by section 5:

4. Are deployment paths B and C **aspirational** (we intend to run on kubernetes, with the harness
   judging releases) or **vestigial** (we run on Netlify and should say so)? Almost every
   inconsistency in release documentation follows from this one unanswered question.

And one left open by section 7, not blocking:

5. Do the six **contract snapshots in `etc/`** survive once none of them guards a published export?
   Keeping them means rewriting their rationale as internal change detection; dropping them is a
   measurable cut to the assurance machinery section 6 counts. The recommendation is to keep.

*Resolved 4 November 2026: the CLI ships as **one** command — `npx tutors` for dynamic generation,
`npx tutors static` and `npx tutors create` — rather than three packages. See section 7.*
