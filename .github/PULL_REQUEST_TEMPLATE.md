<!--
Thanks for contributing. Fill in what applies and delete the rest.
Small PRs are reviewed faster: one logical change per PR.
-->

## What changed and why

<!-- One or two sentences. Link the issue: "Closes #123". -->

## Type of change

<!-- Delete the lines that do not apply. -->
- Bug fix
- New feature
- Documentation
- Refactor / chore
- Test only

## Checks I ran locally

These three are the minimum bar for any PR that touches code. Docs-only PRs can skip them.

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm check`

Everything else runs in CI or nightly and is **not** expected of you locally: fuzz, mutation, contract, e2e, accessibility and release suites. If CI reports a failure in one of those, a maintainer will help you read it.

## If this changes the UI

- [ ] Screenshot or short recording attached (before and after if it is a visual change)
- [ ] Checked in light and dark mode
- [ ] Keyboard-reachable; no new axe violations on http://localhost:5173/course/reference-course

## If this adds or changes behaviour

- [ ] A test covers it (see [guides/TESTING-OVERVIEW.md](../guides/TESTING-OVERVIEW.md) for which tier)
- [ ] Docs updated if a documented behaviour changed

## Anything the reviewer should know

<!-- Trade-offs, follow-ups, things you were unsure about. Unsure is fine; say so. -->
