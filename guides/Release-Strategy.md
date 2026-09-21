# Release Strategy

## Overview

This document defines the release strategy for Tutors. It replaces the previous model of staging work on a long-lived `development` branch with a trunk-based workflow where `main` is always the source of truth and releases are cut, hardened, and shipped through a release candidate (RC) process.

## Principles

1. **Main is always releasable.** Every merged PR should leave `main` in a deployable state. This does not mean every commit ships to production, it means every commit _could_.
2. **Small, frequent merges over large batch integrations.** Long-lived feature branches and staging branches create merge risk, hide integration bugs, and make rollbacks painful. PRs should be scoped, reviewed, and merged continuously.
3. **Semver controls the contract.** Version numbers communicate intent to consumers. A major bump signals breaking changes, a minor bump signals new functionality, and a patch signals fixes. The version number is the release's API, not a marketing decision.
4. **Harden through the RC process, not through branch isolation.** Quality comes from testing release candidates under real conditions, not from keeping changes quarantined on a separate branch.
5. **Tags are immutable release artifacts.** Once a version is tagged, it is never moved or deleted. If a fix is needed, cut a new version.

## Problems with the Current Approach

The existing workflow stages commits on a `development` branch for extended periods before merging to `main`. This creates several issues:

- **Merge debt accumulates.** Months of divergence means merge conflicts grow in number and complexity. A year of staged changes is a year of integration risk landing all at once.
- **No incremental feedback loop.** Changes are not validated against `main` until the batch merge, meaning integration bugs are discovered late.
- **Unclear release state.** It is difficult to answer "what is in production?" or "when will this feature ship?" when the pipeline is a single long-lived branch.
- **Rollback granularity is lost.** If a batch merge introduces a regression, reverting means reverting the entire batch rather than a single scoped change.
- **Changelog and version gaps.** The changelog currently stops at v11.3.0 while `package.json` reports v15.2.0, indicating version bumps happened without corresponding release documentation.

## Branching Model

### Branches

| Branch | Purpose | Lifetime |
|--------|---------|----------|
| `main` | Integration trunk. All PRs target this branch. Always deployable. | Permanent |
| `feature/*`, `fix/*`, `chore/*` | Short-lived work branches off `main`. One concern per branch. | Days, not weeks |
| `release/vX.Y.Z` | Cut from `main` when preparing a release. Only bug fixes land here. | Permanent. Retained after shipping as a recovery point (see Final Release) |

### What Goes Away

- **`development` branch.** No long-lived integration branch. Once existing work is reconciled (see Migration section), this branch is archived and deleted.
- **Direct commits to `main`.** All changes arrive via pull request.

## Versioning

Follow [Semantic Versioning 2.0.0](https://semver.org/):

- **Major (X.0.0):** Breaking changes to public-facing behaviour, URL structure, course format, or API contracts.
- **Minor (X.Y.0):** New features, enhancements, or non-breaking additions.
- **Patch (X.Y.Z):** Bug fixes, performance improvements, dependency updates with no user-facing behaviour change.

### Pre-release Identifiers

Release candidates use the format `vX.Y.Z-rc.N`:

```
v16.0.0-rc.1   # first release candidate
v16.0.0-rc.2   # incorporates fixes found during hardening
v16.0.0        # final release, promoted from last RC
```

### Tag Format

All tags use the `v` prefix for consistency: `v16.0.0`, `v16.0.0-rc.1`. Historical tags with other formats (e.g. `tutors-10.0`) remain as-is but the convention going forward is `vX.Y.Z`.

## Release Lifecycle

### 1. Development Phase

```
main ─────●─────●─────●─────●─────●──── (PRs merge continuously)
           \   /       \   /       \
            PR1         PR2        PR3
```

- Contributors branch from `main`, open PRs back to `main`.
- Each PR must pass CI (lint, type check, unit tests, build) before merge.
- PRs should be reviewed by at least one other contributor.
- `main` receives continuous integration; no changes are staged elsewhere.

### 2. Release Cut

When `main` has accumulated enough changes for a release (or a time-based cadence is reached):

1. **Determine the version bump.** Review merged PRs since the last release. Apply semver rules.
2. **Create the release branch:** `git checkout -b release/vX.Y.Z main`
3. **Bump the version** in `package.json` and update `CHANGELOG.md`. Leave `deploy/k8s/overlays/*/kustomization.yaml` alone: the overlays name what production runs, by digest, and they move only when the release is deployed (see [Deploy and post-deploy](#deploy-and-post-deploy)). Reset `tests/generator/claims.yaml` to `claims: []` once the release's generator changes have shipped.
4. **Write the release's claims** in `release/claims.yaml`: the observable differences from production this release intends, each citing its Rule or CHANGELOG entry. Start from `claims: []` (see [Release Harness](#release-harness)).
5. **Push the branch.** Once `package.json` carries the branch's version, every push is tagged as the next RC (`vX.Y.Z-rc.1`, then `-rc.2`, ...) by `release-dispatch.yml`. RC tags are not made by hand.
6. **Deploy RC to staging** for validation.

```
main ─────●─────●─────●──────────────●──── (development continues)
                       \             /
                        release/v16.0.0
                        │  rc.1  rc.2  │
                        ●────●────●────● ── tag v16.0.0
```

### 3. Hardening Phase

During the RC phase, the release branch accepts **only** bug fixes:

- Fixes are developed on short-lived branches off `release/vX.Y.Z`.
- Each fix is cherry-picked or merged back to `main` to prevent regression.
- Each push of fixes becomes the next RC (`vX.Y.Z-rc.2`, `vX.Y.Z-rc.3`, ...) and is judged by the release harness again. A fix that changes what a student sees needs its claim in `release/claims.yaml` in the same push.
- No new features land on the release branch.

### 4. Final Release

When the RC is validated and stable:

1. **Tag the final release** on a commit whose git tree equals the last release candidate's: `git tag vX.Y.Z` on the release branch HEAD, which is the commit `vX.Y.Z-rc.N` already points at. **Do not add a commit between the last RC and the tag**, not even a changelog or version touch-up: the final tag ships the RC's images rather than rebuilding them, and it may only do so when the source is provably the same. A merge or fast-forward that leaves the files unchanged is fine, because the comparison is of trees, not commit ids. Check before tagging: `test "$(git rev-parse vX.Y.Z-rc.N^{tree})" = "$(git rev-parse HEAD^{tree})" && echo same`. What happens when they differ is under [Final tag: the candidate ships](#final-tag-the-candidate-ships).
2. **Merge the release branch back to `main`** to capture any hardening fixes.
3. **Create a GitHub Release** from the tag with release notes.
4. **Deploy to production.** Pin the overlays to the release's images by digest, roll them out, and tell the release harness what is now deployed: [Deploy and post-deploy](#deploy-and-post-deploy).
5. **Retain the release branch.** It is not deleted. The tag is the canonical, immutable artifact, but the branch is kept as a recovery point: if an issue surfaces late, the release line is still there to branch a fix from without first having to locate the right commit on `main`.

   Two things follow from retaining it. A branch is mutable where a tag is not, so a retained release branch must not be pushed to after its release ships — once it moves it no longer records what was released. And retention is not a substitute for tagging: every release still gets a `vX.Y.Z` tag and a GitHub Release, which are what consumers and tooling read.

### 5. Hotfix Process

Critical production bugs that cannot wait for the next release cycle:

1. Branch from the latest release tag: `git checkout -b fix/critical-issue vX.Y.Z`
2. Fix, test, and open a PR against `main`.
3. If a production patch is needed immediately, cut a patch release: tag `vX.Y.Z+1` from the fix branch. A tag with no release candidate behind it cannot be promoted, so its images are rebuilt and the run says so (see [Final tag: the candidate ships](#final-tag-the-candidate-ships)). To ship a judged image, run the hotfix through a `release/X.Y.Z+1` branch instead, so it gets a candidate.
4. Merge the fix to `main`.

## Changelog Discipline

Every release must have a corresponding `CHANGELOG.md` entry. Entries are written at release-cut time by reviewing merged PRs and grouping them:

```markdown
## [16.0.0] - 2026-07-20

### Breaking Changes
- Removed legacy auth flow (#1100)

### Features
- Added Jupyter notebook support (#1085)
- Enhanced card system with landscape layout (#1090)

### Fixes
- Fixed lab navigation scroll behaviour (#1092)
```

The changelog documents what shipped and when. It is not a commit log; it is a curated summary for users and contributors.

## CI/CD Integration

### PR Checks (on every PR to `main`)

- Lint and format (`prettier --check`, `eslint`)
- Type checking (`svelte-check`)
- Unit tests (`vitest`)
- Build verification (`vite build`)

### Release Branch Checks (on RC tags)

- All PR checks, plus:
- Integration / E2E tests (`playwright`)
- Mutation testing (`stryker`) on changed modules
- Staging deployment and smoke test

### Release Checks (on final version tags)

- Image promotion: the candidate's images are retagged as the release, not rebuilt (`image-build.yml`, see [Final tag: the candidate ships](#final-tag-the-candidate-ships))
- Production deployment: `deploy.yml` verifies the digest pins, then updates the harness's production tag and starts its post-deploy comparison
- Post-deploy smoke test

### Release Harness

The [release harness](https://github.com/tutors-sdk/tutors-release-harness) is a separate repository that runs the production images beside a candidate's images and fails on any observable difference the release did not claim. It lives apart from this repository so that the PR being judged cannot weaken its judge. Three workflows here feed it; the third, `deploy.yml`, is described under [Deploy and post-deploy](#deploy-and-post-deploy).

**`release-dispatch.yml`**, on every push to `release/**`:

1. **Candidate.** The version comes from the branch name (`release/16.3.0` and `release/v16.3.0` both work). The push is a candidate only when `package.json` carries that version; earlier pushes are skipped with a notice, and so is any push after `vX.Y.Z` itself has been tagged. The commit is tagged `vX.Y.Z-rc.N` with the next free `N`; re-running the workflow reuses the tag already on the commit.
2. **Images.** A tag created by a workflow's own token does not trigger other workflows, so the `v*` tag trigger of `image-build.yml` never sees an RC tag. The job starts `image-build.yml` on the tag with `workflow_dispatch`, watches the run (a Trivy finding fails the candidate here) and then waits until `quay.io/tutors-sdk/tutors-{reader,catalogue,live}:X.Y.Z-rc.N` can be pulled anonymously. If `image-build.yml` is absent or has no `workflow_dispatch` trigger, the job warns and continues, and the harness builds the candidate from the git tag instead.
3. **Dispatch.** A `repository_dispatch` of type `release-candidate` to `tutors-sdk/tutors-release-harness`, which runs its release, migration and upgrade modes. The result is in that repository's Actions tab, linked from this workflow's summary.

| `client_payload` | Value |
| --- | --- |
| `production` | `images[].newTag` of `deploy/k8s/overlays/reader/kustomization.yaml` **on `main`**. The overlays name the deployed version and move only when a release is deployed, so during a release cycle this is still production, not the candidate |
| `candidate` | `X.Y.Z-rc.N` |
| `claims_url` | `https://raw.githubusercontent.com/tutors-sdk/tutors-mono-repo/<sha>/release/claims.yaml`, pinned to the tagged commit |
| `runs` | `3` |
| `migrations_a` | `v<production>`, or `release/<production>` for a release that was never tagged |
| `migrations_b` | the tagged commit's sha |

**`release-claims.yml`**, on the same pushes and on release PRs, fails when `release/claims.yaml` is missing or is not a file the harness would accept (`pnpm check:release-claims`). The file format is in [release/README.md](../release/README.md); changes to it are owned by the maintainers through CODEOWNERS, because a claim waives a failure.

#### Final tag: the candidate ships

The harness judges the `X.Y.Z-rc.N` images, so the final tag must ship those images. A final tag `vX.Y.Z` therefore does not build: for each of the four apps `image-build.yml` runs `scripts/promote-image.ts`, which **promotes** the candidate, meaning it points `X.Y.Z`, `X.Y`, `latest` and `sha-<short of the final commit>` at the candidate's existing digest (`docker buildx imagetools create`). Nothing is rebuilt, so the digest, the cosign signature and the SBOM attestation, which are attached by digest, are the ones the harness judged.

An app is promoted only when all four hold:

| Check | Why |
| --- | --- |
| The registry has `X.Y.Z-rc.N` for the app; the **highest N** is used | The last candidate is the one the harness judged last |
| The git tree of `vX.Y.Z-rc.N` equals the git tree of the final tag's commit | Same source. Commit ids may differ (a release branch merged to `main` has its own sha); trees may not |
| The image's `org.opencontainers.image.revision` label is the commit `vX.Y.Z-rc.N` points at | The image was built from that tag |
| `cosign verify` of the digest succeeds for `image-build.yml` at `refs/tags/vX.Y.Z-rc.N` on that commit | It is the image that workflow built and signed |

Then Trivy scans the promoted digest with the same gate as a build (CRITICAL and HIGH with a fix fail the run) before any tag moves: the scan at RC time cannot know about a vulnerability with a fix published since, and the release must not ship one that a rebuild would have been stopped for. If that fails, the fix is a new candidate, which the harness judges again. `X.Y.Z` and `sha-<short>` are retagged first and checked (every tag resolves to the promoted digest, `cosign verify` and the SBOM attestation lookup succeed on `X.Y.Z`); only then do `X.Y` and `latest` move, so a failure leaves `latest` on the previous release.

Once an image is promoted, the digest named by the overlays' `digest:` (`pnpm deploy:pin`), `HARNESS_PRODUCTION_TAG`, and the `digests` that `deploy.yml` sends with the harness's `deployed` event are the candidate's digest, so the harness can compare what is deployed with what it judged. The signing certificate's identity is still `image-build.yml`, at the candidate's ref (`@refs/tags/vX.Y.Z-rc.N`); the harness's identity regexp ends in `@` and accepts it. A promoted image's `org.opencontainers.image.version` label reads `X.Y.Z-rc.N` and its revision is the candidate's commit: that is how to recognise a promoted image from a shell (`docker buildx imagetools inspect --format '{{json .}}' quay.io/tutors-sdk/tutors-reader:X.Y.Z`).

**When an app cannot be promoted** (no candidate, different tree, revision or signature mismatch, or the registry or git could not be read) the run does not fail silently or promote on a guess. By default it falls back to the old behaviour for that app, and says so loudly:

- a `::warning::` annotation titled `REBUILT — this image is not the one the release harness judged`, with the reason;
- the same line in the job summary, per app;
- `promoted=false` as the `Decide whether to promote the release candidate` step's output (a matrix job cannot carry one job output per app, so read it from the step, the summary or the annotation).

**A REBUILT image** is one whose `version` label is `X.Y.Z` (no `-rc`), whose revision is the final tag's commit and whose digest differs from the candidate's. The harness never compared it; treat it as unjudged. To get a judged release, cut another candidate from the commit you want to ship (a new RC is a new image, judged again) and tag the final on that commit. A push of the tag cannot carry an input, so it always takes the default fallback; use the tree check under [Final Release](#4-final-release) before tagging to be sure it will promote. `require_promotion=true` is for a manual dispatch on the tag (`gh workflow run image-build.yml --ref vX.Y.Z -f require_promotion=true`), which fails before anything is built or pushed instead of rebuilding.

Prerelease tags, `main`, `rc/**` branches, pull requests and the backfill dispatch are unchanged and never promote. Preview a decision with `pnpm promote:image plan --app reader --ref vX.Y.Z --dry-run`; it reads git and the registry and changes nothing.

#### Setup

| What | Where | Value |
| --- | --- | --- |
| Secret `HARNESS_TOKEN` | this repository, Actions secrets | A fine-grained personal access token whose resource owner is `tutors-sdk`, with access to **only** `tutors-sdk/tutors-release-harness` and two repository permissions: **Contents: read and write**, which the [repository dispatch endpoint](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event) requires (`release-dispatch.yml` and `deploy.yml`), and **Variables: read and write**, which [creating and updating a repository variable](https://docs.github.com/en/rest/actions/variables) requires (`deploy.yml` setting `HARNESS_PRODUCTION_TAG`). Metadata: read is added automatically. Actions: write is what `workflow_dispatch` needs and authorises neither call. A classic token needs the `repo` scope for both. Give it an expiry and note the renewal date; an expired token fails the dispatch job with a 401, and a token without Variables fails `deploy.yml` with a 403 before anything is dispatched |
| Secrets `QUAY_USERNAME`, `QUAY_PASSWORD` | this repository | Used by `image-build.yml` (the push, and the retag on a final tag), not by the dispatch. The robot needs write access to the four repositories; retagging an existing digest needs no more than pushing did |
| Variable `HARNESS_IMAGE_PREFIX` | the harness repository | **Open.** The harness expands a bare tag to `<prefix>/<app>:<tag>`, while `image-build.yml` publishes `quay.io/tutors-sdk/tutors-<app>:<tag>`, which no prefix can produce. Until one side changes, the harness fails to pull and builds both sides from their git tags (`v<tag>`), which is slower but compares the same code. The payload deliberately stays bare tags so that this fallback keeps working |
| Quay repositories | quay.io | Public, so the harness and the wait step can pull without credentials |

Everything else uses the workflow's own `GITHUB_TOKEN`: `contents: write` in the tagging job only, `actions: write` in the image job only, and nothing at all in the jobs that hold `HARNESS_TOKEN`. The token's Variables permission is wider than the candidate dispatch needs; `deploy.yml` and `release-dispatch.yml` share the secret on purpose, one credential to rotate. To split them, give `deploy.yml` its own secret and keep the other one Contents-only.

#### Deploy and post-deploy

The overlays under `deploy/k8s/overlays/` name what production runs, so that is where the harness's notion of "deployed" comes from. Each pins its image twice, side by side:

```yaml
images:
  - name: tutors-app
    newName: quay.io/tutors-sdk/tutors-reader
    newTag: "16.2.2"        # for people, and read by release-dispatch.yml as the production tag
    digest: sha256:7567...  # what the container runtime pulls
```

Kustomize renders that as `quay.io/tutors-sdk/tutors-reader:16.2.2@sha256:7567...`. The runtime pulls the digest and ignores the tag, so a tag pushed again cannot change what is deployed, while `git log` and `release-dispatch.yml` still read a version. The digest is the multi-arch index digest that `image-build.yml` signs with cosign.

Deploying a release, once `vX.Y.Z` is tagged and `image-build.yml` has published it:

1. **Pin.** `pnpm deploy:pin X.Y.Z` asks Quay for the digest of each `tutors-<app>:X.Y.Z`, checks that digest is signed by `image-build.yml` (`cosign verify`, by digest) and rewrites the four overlays together, or none of them. Open a pull request. Needs docker (buildx) and cosign 3 or later.
2. **Verify.** `deploy.yml` runs on that pull request and again on `main` (`pnpm check:deploy-pins --registry`). It fails when an overlay has no digest or a malformed one, when the tag is not a release `X.Y.Z`, when the four overlays name different releases or share a digest, when a tag no longer resolves to its digest, or when a digest is not signed by `image-build.yml`. Without `--registry` the same form checks run in the unit tests (`tests/conformance/deploy-pins.test.ts`), and `pnpm check:k8s` fails any rendered image that is not digest-pinned.
3. **Roll out.** `oc apply -k deploy/k8s/variants/openshift/<app>`, or a GitOps controller syncing `main`. This happens outside the repository.
4. **Announce.** After a push to `main` that changed a pin, the `announce` job of `deploy.yml` waits for approval in the `production` environment, then sets `HARNESS_PRODUCTION_TAG` on `tutors-sdk/tutors-release-harness` to `X.Y.Z` (`gh variable set`), so nightly noise, the weekly mutants and the harness's CI compare against what is deployed, and sends `repository_dispatch` of type `deployed`. That runs the harness's `post-deploy.yml`: the reference-course journeys against production, compared with the candidate's recorded release run; a new difference opens a `rollback` issue there.

The order in step 4 is deliberate: a failure setting the variable stops the job before anything is dispatched, and both calls are idempotent, so re-running the job or dispatching `deploy.yml` by hand is safe. Add the maintainers as required reviewers of the `production` environment (Settings, Environments) so that the approval means "the rollout has finished"; until that is configured the job runs as soon as verify passes.

`deploy.yml` sends `{"event_type": "deployed", "client_payload": {"production": "X.Y.Z", "digests": {"reader": "sha256:...", "catalogue": "sha256:...", "live": "sha256:..."}}}`. Harness contract 1.1.0 reads no field of a `deployed` payload and ignores unknown ones, so today `production` and `digests` only appear in the run record.

**Pinned digest equals judged digest.** Since the final tag promotes the last release candidate's image instead of rebuilding it (see [Final tag: the candidate ships](#final-tag-the-candidate-ships)), `X.Y.Z` resolves to the same digest as the `X.Y.Z-rc.N` image the harness judged. `pnpm deploy:pin X.Y.Z` therefore pins the judged digest: the digest the overlays name, the one `deploy.yml` sends in `digests`, and the one the harness compared are one and the same, for an app that was promoted. The signature check accepts both signing refs, `refs/tags/vX.Y.Z-rc.N` (a promoted image, signed at the candidate's ref) and `refs/tags/vX.Y.Z` (an image the run had to rebuild), in both `deploy:pin` and `check:deploy-pins --registry`.

**What is not yet closed.** Two things need harness changes (contract 1.1.0: `release-candidate` takes bare tags, `deployed` takes nothing), so the equality is not yet enforced by the harness:

- `release-candidate` should accept the digests of both sides, so the harness pulls exactly what `release-dispatch.yml` published and what the overlays pin: optional `production_digests` and `candidate_digests`, each `{"reader": "sha256:...", "catalogue": "sha256:...", "live": "sha256:..."}`, turned into `--a` and `--b` references of the form `repo:tag@sha256:...`, which the CLI already accepts.
- `deployed` should read `production` and `digests` and compare `digests` with the `provenance.b.images.*.digest` of the recorded release run, warning when they differ.

An app that could not be promoted is rebuilt, so its pinned digest differs from the judged one; the promote step says so loudly (`REBUILT`), and for that app `post-deploy` is the check that what is deployed behaves like what was judged.

#### Running the harness locally

Nothing about judging a candidate needs GitHub. `pnpm release:harness` builds the `release-candidate` payload above from your own clone, with git alone (no `gh api`, no network), and can hand it to the harness's `local gate`:

```console
pnpm release:harness                    # print the payload (the same as --print)
pnpm release:harness --run              # run `pnpm harness local gate` with those values
pnpm release:harness --deployed --run   # after a deploy: `local watch --once`, with HARNESS_PRODUCTION_TAG set
```

Clone the [harness](https://github.com/tutors-sdk/tutors-release-harness) beside this repository (or set `HARNESS_DIR`) and run `pnpm install` there; `pnpm harness doctor` in it says what else the machine needs. Arguments after `--` go to the harness (`pnpm release:harness --run -- --only release --dry-run`).

It takes each value from where the workflow does, so run it on the release branch:

| Field | Local source |
| --- | --- |
| `production` | the reader overlay on `origin/main` (or `main`; `--main-ref` names another), not on the release branch. `git fetch origin` first |
| `migrations_a` | tag `v<production>`, else branch `release/<production>`, in your clone (`git fetch origin --tags`) |
| `candidate` | `--candidate`, else the `vX.Y.Z-rc.N` already on the commit, else the next free `N`. The version is `package.json` at the commit and must match a `release/X.Y.Z` branch name. Nothing is tagged: push the tag before a real gate, because the harness builds a candidate the registry lacks from its tag |
| `migrations_b` | the commit (`--ref`, default `HEAD`) |
| `claims_url` | the raw URL of `release/claims.yaml` at that commit; `--run` passes the file as read from that commit. The file is shape-checked first |
| `runs` | `3` (`--runs`) |

`production_digests` (from the overlays' `digest`, once they carry one), `candidate_digests` (`--candidate-digest reader=sha256:...`) and `rules_url` (`--rules-url`) are added only when there is something to send. `release-dispatch.yml` still builds its payload with `gh api`, because its checkout is shallow and its tag is made through the API; `tests/conformance/release-harness.test.ts` holds the two to the same fields, order and rules.

#### `rc/**` and `release/**`

`rc-validation.yml` and `release-testing.yml` trigger on `rc/**` branches, which predate this document's branching model; releases since 16.0.0 have been cut as `release/X.Y.Z` branches and only one `rc/` branch (`rc/16.2.0`) was ever pushed. The harness dispatch follows the branches releases really use. Moving the two validation workflows to `release/**` is a separate change.

## Migration from Current Workflow

Transitioning from the `development` branch model:

1. **Audit `development`.** Review the 56 diverged commits. Identify which changes are complete, tested, and ready to ship versus work-in-progress.
2. **Break into PRs.** Decompose the ready changes into scoped PRs against `main`. Each PR should be independently reviewable and mergeable.
3. **Discard or re-branch WIP.** Incomplete work should be rebased onto `main` as new `feature/*` branches, not carried forward as a lump.
4. **Archive and delete.** Once all valuable work is extracted, archive `development` (tag it as `archive/development-final` for reference) and delete the branch.
5. **Align version and changelog.** The current `package.json` version (15.2.0) and last changelog entry (11.3.0) are out of sync. As part of the first release under this strategy, reconcile these: update the changelog to reflect what shipped between 11.3.0 and the current state, and cut the next release with a clean semver baseline.

## Release Cadence

This strategy does not mandate a fixed cadence. Releases are cut when there is meaningful value to ship. However, avoid letting `main` accumulate more than 4-6 weeks of unreleased changes, as this reintroduces the batching problem this strategy eliminates.

A lightweight rhythm to consider:

- **Minor releases:** every 4-6 weeks, or when a significant feature lands.
- **Patch releases:** as needed for bug fixes.
- **Major releases:** planned, with a deprecation notice in the prior minor release.

## Summary

| Aspect | Old Model | New Model |
|--------|-----------|-----------|
| Integration branch | `development` (long-lived) | `main` (continuous) |
| Release mechanism | Batch merge to `main` | RC branch, tag, harden, ship |
| Version bumps | Ad-hoc in `package.json` | Semver with changelog entry |
| Tags | Inconsistent naming | `vX.Y.Z` / `vX.Y.Z-rc.N` |
| Rollback granularity | Entire batch | Individual PR revert |
| Time to production | Months | Days to weeks |
| Risk profile | High (big bang) | Low (incremental) |
