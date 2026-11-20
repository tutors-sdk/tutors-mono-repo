# Tutors Validator

A separate Tutors app for checking courses, using the shared Tutors shell and appearance settings. Intended host: `validator.tutors.dev`.

```sh
pnpm install --frozen-lockfile
pnpm dev:validator
```

Open `http://localhost:5177`. No sign-in, database, or private environment variables are needed.

- **Course URL:** accepts a published course host, a Netlify site name, a `tutors.dev/course/...` link, or a direct `tutors.json` URL. The browser fetches the JSON without credentials, checks it against `TUTORS_JSON_SCHEMA` (V020), and applies the source validator's metadata checks (V006) to properties, calendar, and enrollment. It also diagnoses every quiz in the nested learning-object tree. The host must allow cross-origin reads, as standard Tutors course hosting does. Responses are limited to 20 MB and 15 seconds.
- **Source ZIP:** the shared `@tutors/course/validation` adapter checks the source files using `@tutors/course-rules`. The reader's existing `/create/check` page uses the same adapter and findings component. A single containing folder is stripped from archives. Compressed size is limited to 1 GB, expanded source text to 100 MB, and file count to 100,000. Binary resources are indexed by path and size without decompression. Unsafe parent paths are refused before validation.

Checks run in a disposable browser worker. A new check cancels the previous request and worker. ZIP contents and findings are never uploaded, stored, or included in a remote error transport. Validation makes no changes to the course. A published URL cannot establish whether missing source files or folder names are valid; use a source ZIP for that. Every source rule is enabled for ZIP checks, including Mermaid syntax through the browser's Mermaid parser. A diagram the parser cannot judge produces a warning rather than an all-clear. Remote link availability is not checked.

## Deployment

Create a separate Netlify project connected to `tutors-sdk/tutors-mono-repo`; keep the existing Tutors projects unchanged.

1. In Netlify, choose **Add new project → Import an existing project → GitHub**, then select the repository.
2. Select `apps/validator` as the site/package directory. Use branch `codex/course-validator` to share it before merging; switch the production branch to `main` after the PR is merged.
3. Under build settings use the values below. The package directory tells Netlify to load `apps/validator/netlify.toml`, while installs and builds run from the monorepo root.

| Setting           | Value                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Base directory    | Repository root (leave empty, or `/`)                                                                         |
| Package directory | `apps/validator`                                                                                              |
| Build command     | `pnpm install --frozen-lockfile && pnpm check:env --app validator && pnpm --filter tutors-validator... build` |
| Publish directory | `apps/validator/build`                                                                                        |
| Node version      | `26.13.0` (set in `netlify.toml`)                                                                             |
| pnpm version      | `11.24.0` (root `packageManager`)                                                                             |

4. No authentication, database, or private environment variables are required. Do not copy other apps' Supabase or auth secrets. Leave `SVELTEKIT_ADAPTER` unset so the shared adapter detects Netlify. Optionally set `PUBLIC_VALIDATOR_ORIGIN` to the chosen public URL; it defaults to `https://validator.tutors.dev`.
5. Deploy and share the generated `https://<site-name>.netlify.app` URL. Test a published course, then drop a source ZIP and confirm the success/warning/error report appears.
6. To use `validator.tutors.dev`, add it under **Domain management**, then follow Netlify's DNS instructions for that subdomain. With external DNS this is normally a CNAME named `validator` pointing at `<site-name>.netlify.app`; with Netlify DNS use its project/domain assignment. Wait for DNS verification and the HTTPS certificate, then make it the primary domain.

The config includes the publish path and build command. The SvelteKit Netlify adapter generates the function and routing configuration; no manual SPA redirect is needed. The CSP allows browser requests to course hosts and the validation worker. No server-side URL proxy or file-upload endpoint is provided.

References: [Netlify monorepo configuration](https://docs.netlify.com/build/configure-builds/monorepos/), [SvelteKit on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/sveltekit/).

The shared Dockerfile also builds it with `--build-arg APP_NAME=validator`; `docker compose up --build validator proxy` serves it at `http://localhost:3004`. Registry publication, production image pins, DNS and OpenShift rollout must be set up before releasing the shell's new Validator link. No production deployment is performed by this change.

`PUBLIC_VALIDATOR_ORIGIN` controls cross-app shell links; it defaults to `https://validator.tutors.dev`. For local development set it to `http://localhost:5177` (or `http://localhost:3004` for Compose).

## Checks

```sh
pnpm --filter tutors-validator check
pnpm --filter tutors-validator... build
pnpm test:e2e:validator
```

Rules 0754–0757 are proved by the browser tests, including an actual worker validating nested content, precise enrollment failures, Mermaid syntax, drag-and-drop, cancellation, accessibility, and the absence of upload requests. Unit tests cover URL handling, published findings, fetch failures, response size limits, and ZIP limits.

## Workspace packages

- `@tutors/app-config`: shared app, build, and environment configuration.
- `@tutors/course`: shared ZIP adapter.
- `@tutors/course-rules`: source and metadata rules.
- `@tutors/tutors-types`: generated course schema.
- `@tutors/ui-navigators`, `@tutors/ui-components`, `@tutors/ui-primitives`: shell, findings, and controls.
- `@tutors/runes`, `@tutors/themes`, `@tutors/i18n`: shared state, appearance, and navigation labels.
- `@tutors/logger`, `@tutors/metrics`, `@tutors/runtime`: server request logs, metrics, clock, and version endpoint.

Published schema validation is precompiled by `scripts/generate-validator-schema.ts` during the build. Its committed output is checked against the shared schema by a unit test; CSP does not require `unsafe-eval`. Older courses missing only the generated `authLevel` field receive one compatibility warning instead of cascading schema errors, while their metadata and content are still checked.
