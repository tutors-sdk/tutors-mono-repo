# OpenSSF Scorecard — Baseline

[OpenSSF Scorecard](https://github.com/ossf/scorecard) assesses a project's
supply-chain security posture across ~18 automated checks and produces an
aggregate score out of 10. This complements the existing
[zizmor](../../.github/workflows/zizmor.yml) workflow (which audits GitHub
Actions specifically) with a broader repository-level view.

## How it runs here

- **CI:** [`.github/workflows/scorecard.yml`](../../.github/workflows/scorecard.yml)
  runs weekly (and on pushes to `main`), publishes to the public OpenSSF
  dashboard, and uploads SARIF to GitHub code scanning.
- **Locally:** [`scripts/scorecard-local.sh`](../../scripts/scorecard-local.sh)
  reuses your `gh` login token. It uses `scorecard` from `PATH`, else Docker,
  else downloads the released binary to `~/.cache/scorecard`.

  ```bash
  scripts/scorecard-local.sh                 # full run
  scripts/scorecard-local.sh --checks SAST   # single check
  SCORECARD_FORMAT=json scripts/scorecard-local.sh > scorecard.json
  ```

## Baseline results

Captured 2026-08-31 with Scorecard v5.5.0 against `tutors-sdk/tutors-mono-repo`
using a standard user token.

**Aggregate score: 6.4 / 10**

| Score | Check | Notes |
|------:|-------|-------|
| 10/10 | Binary-Artifacts | No binaries committed. |
| 10/10 | Dangerous-Workflow | No dangerous Actions patterns. |
| 10/10 | Dependency-Update-Tool | Update tooling detected. |
| 10/10 | Fuzzing | Project is fuzzed. |
| 10/10 | License | License file present. |
| 10/10 | Pinned-Dependencies | All dependencies pinned (result of the zizmor hardening). |
| 10/10 | Security-Policy | `SECURITY.md` present. |
| 10/10 | Token-Permissions | Workflow tokens follow least privilege. |
|  6/10 | Contributors | 2 contributing organizations. |
|  5/10 | CI-Tests | 6 of 12 recent merged PRs had a CI check. |
|  5/10 | Vulnerabilities | 5 open advisories in dependencies (see below). |
|  3/10 | Code-Review | 4 of 13 changesets were approved before merge. |
|  1/10 | SAST | SAST tool run on only 5 of 27 commits. |
|  0/10 | Branch-Protection | Not enabled on `main`. (Also under-reported without an admin token.) |
|  0/10 | CII-Best-Practices | No OpenSSF best-practices badge. |
|  0/10 | Maintained | Repo created < 90 days ago; rises with sustained activity. |
|   ?   | Packaging | No packaging workflow detected. |
|   ?   | Signed-Releases | No releases found yet. |

### Open vulnerabilities flagged (Vulnerabilities: 5/10)

- https://osv.dev/GHSA-29g2-3rmr-qm68
- https://osv.dev/GHSA-55q2-fjhq-7xh7
- https://osv.dev/GHSA-5p4m-2wfm-xmqj
- https://osv.dev/GHSA-2v37-7h3g-55p8
- https://osv.dev/GHSA-q8mj-m7cp-5q26

## Suggested remediations (highest leverage first)

1. **Branch-Protection (0 → high):** enable protection on `main` — require PRs,
   ≥1 approving review, and passing status checks. Biggest single-check gain,
   and it also lifts Code-Review over time.
2. **SAST (1):** the repo already has zizmor + CodeQL-compatible SARIF upload.
   Add a CodeQL workflow (or run it on PRs) so SAST coverage counts per commit.
3. **Code-Review (3):** enforce review-before-merge via branch protection;
   avoid direct pushes / self-merges.
4. **Vulnerabilities (5):** triage the 5 advisories above (`pnpm audit`,
   bump/override transitive deps).
5. **CII-Best-Practices (0 → in progress):** register at https://www.bestpractices.dev/ and complete the self-assessment (see #132).
6. **Branch-Protection token:** set a fine-grained read-only `SCORECARD_TOKEN`
   secret (administration:read + metadata:read) so CI reads protection settings
   accurately instead of scoring 0 by default.

Checks marked `?` are not scored (no packaging workflow / no releases yet) and
do not drag the aggregate down.
