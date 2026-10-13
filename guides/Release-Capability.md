# Release Capability

A central, reusable way to release a versioned package: conventional commits decide the version, a bot keeps the release pull request, merging it tags and publishes with provenance, and a canary checks what the registry actually serves. Any workflow in this repository, or in another repository, can call it.

Today it releases the six JSR libraries in `packages/jsr` that version together (`@tutors/tutors-model-lib`, `-time-lib`, `-gen-lib`, `-create`, `tutors-lite`, `tutors`). The apps are not released this way: they ship through release branches, candidates and the release harness in [Release-Strategy.md](Release-Strategy.md) and [release/SOP.md](../release/SOP.md), whose final tag must be the candidate's tree, which a bot-made release commit cannot be.

## How it works

| Step | Where | What happens |
| --- | --- | --- |
| 1. Gate | [reusable-release-please.yml](../.github/workflows/reusable-release-please.yml) | On every push to `main`, a release is due only when a commit touching a released path since its last tag is a `feat`, carries `!` or `BREAKING CHANGE:`, or has a `Release-As:` footer. Fixes and chores wait and ship with the next minor. |
| 2. Release pull request | same | [release-please](https://github.com/googleapis/release-please) keeps one pull request with the version bumps (`deno.json`, `package.json`) and a `CHANGELOG.md` per package. It is opened with the release GitHub App's token so its CI starts without approval. |
| 3. Tag | same | Merging that pull request tags each package `<component>-vX.Y.Z` (for example `tutors-model-lib-v5.4.0`) and creates its GitHub release, kept from becoming the repository's Latest, which stays the apps' `vX.Y.Z`. These tags never match `v*`, so they start no image build. |
| 4. Validate and publish | [reusable-publish-jsr.yml](../.github/workflows/reusable-publish-jsr.yml) | In the same run: `deno publish --dry-run` for each released package, then `deno publish` in the config's order, so a library goes out before the packages that import it. GitHub's OIDC token authenticates the publish and JSR records Sigstore provenance; no publish token is stored. |
| 5. Canary | same | From an empty directory: JSR serves the exact version, it has provenance, and `deno cache jsr:@tutors/<pkg>@X.Y.Z` resolves its whole graph. A failure opens an issue. |

[release-please.yml](../.github/workflows/release-please.yml) is the caller that wires these together for this repository; the config is [.github/release-please/config.json](../.github/release-please/config.json) and the current versions are in [manifest.json](../.github/release-please/manifest.json).

Dependabot already follows the same policy ([.github/dependabot.yml](../.github/dependabot.yml)): no patch-only bumps, one grouped pull request a week, a seven-day cooldown.

## One-time setup

These need a maintainer with admin rights; the workflows cannot do them.

1. **Release GitHub App.** Create a GitHub App owned by `tutors-sdk` with repository permissions Contents, Pull requests and Issues set to read and write, and install it on this repository only. Generate a private key.
2. **Variable and secret.** In this repository's Settings, Secrets and variables, Actions: add the variable `RELEASE_APP_CLIENT_ID` (the app's Client ID, not its App ID) and the secret `RELEASE_APP_PRIVATE_KEY` (the whole `.pem`). Without them releases still work, but the release pull request's CI waits for someone to approve it, and a warning says so.
3. **Actions may open pull requests.** Settings, Actions, General: tick "Allow GitHub Actions to create and approve pull requests". This is only needed for the fallback without the app.
4. **Link each package on JSR.** On jsr.io, in each of the six packages' Settings, link the GitHub repository `tutors-sdk/tutors-mono-repo`. JSR accepts an OIDC publish only from a linked repository.
5. **First release.** The config's `bootstrap-sha` starts history at the commit this capability landed on, so the first release pull request lists only what merges after it. Nothing needs tagging by hand.

## Day to day

- **Write conventional commits** (or squash-merge with a conventional pull request title). `feat(gen): ...` asks for a minor, `feat(gen)!: ...` or a `BREAKING CHANGE:` footer for a major, and `fix`, `refactor`, `perf` are listed but wait for the next feature.
- **Release** by merging the open `chore: release main` pull request once its CI is green. Edit its changelog in the pull request first if a line reads badly.
- **Ship a fix now:** Actions, Release Please, Run workflow, tick `force-release`. Or put `Release-As: 5.3.1` in a commit's footer to choose the version.
- **A major bump** also needs the `jsr:@tutors/...@^5.3.0` imports in `gen`, `tutors` and `tutors-lite` raised in the release pull request, because release-please does not rewrite import ranges.
- **When the canary fails,** a published JSR version cannot be replaced: yank it on jsr.io if it is broken, fix forward and release again. Re-running the workflow is safe, since `deno publish` skips versions JSR already has.

## Releasing another package

Add the package to [config.json](../.github/release-please/config.json) with its `component`, `package-name` and the files that carry its version, and add its current version to [manifest.json](../.github/release-please/manifest.json). To version it with the others, add its component to the `linked-versions` plugin; leave it out to version it alone. `@tutors/tutors-types` and `@tutors/identity` are deliberately not listed: they are consumed inside the workspace and are not published.

## Using it from another repository

The two reusable workflows take everything from their inputs, so another repository can call them by commit:

```yaml
jobs:
  release-please:
    uses: tutors-sdk/tutors-mono-repo/.github/workflows/reusable-release-please.yml@<sha>
    permissions: { contents: write, pull-requests: write }
    with:
      force-release: ${{ inputs.force-release == true }}
      app-client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}
    secrets:
      app_private_key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}

  publish:
    needs: release-please
    if: needs.release-please.outputs.releases_created == 'true'
    uses: tutors-sdk/tutors-mono-repo/.github/workflows/reusable-publish-jsr.yml@<sha>
    permissions: { contents: read, id-token: write, issues: write }
    with:
      paths: ${{ needs.release-please.outputs.paths_released }}
```

With no `config-file` or `manifest-file` inputs it reads release-please's defaults, `release-please-config.json` and `.release-please-manifest.json`, at that repository's root. A single-package repository uses the path `.` and `"include-component-in-tag": false`, which gives plain `vX.Y.Z` tags. The calling repository needs its own app installation, variable and secret (steps 1 to 4 above). A package for another registry needs its own publish workflow; the release front end is the same.

## Known limits

- A merge commit repeats its pull request's title in its body, so a change merged without squashing can appear twice in the release pull request's changelog. Squash-merge library changes, or delete the duplicate line in the release pull request before merging.
- The gate reads tags as `<component><tag-separator>vX.Y.Z` (or `vX.Y.Z` with `include-component-in-tag: false`). A config that changes `include-v-in-tag` needs the gate's pattern changed too.
