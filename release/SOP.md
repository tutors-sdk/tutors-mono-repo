# Release SOP

The standard work for every Tutors release: three roles, twelve steps, one owner per step, and a done-when that is a file or a recorded action, never a feeling. Keep this page open during a release and work down the table. The commands for each step, what they print and what stops the line are in the harness's how-to-run guide, [Running a release](https://github.com/tutors-sdk/tutors-release-harness/blob/main/docs/user-guide/10-running-a-release.md). What a run produces is on the [harness report pages](https://tutors-sdk.github.io/tutors-release-harness/): the **Main to RC** report there is today's `main` judged against the last release, exactly as a candidate would be.

## The five Lean ideas, and where each one lives

| Idea | What it means here | Where it lives |
| --- | --- | --- |
| **Jidoka** (stop the line) | The gate stops the release on any observable difference no claim covers. A FAIL is a FAIL; no score, band or argument talks it back on. | The harness gate; `release/claims.yaml`; steps 5, 9 |
| **Visual management** | One score, decomposed into the points it lost, read the same way by everyone: Gate, then the confidence score and its band. | `report.html` and `gate.md` from `harness release` (the Captain posts `gate.md` to the release PR); the harness report pages; step 7 |
| **Standard work** | This sheet: an owner, an input and a done-when per step. Skipping a step is not a fast release; it is a deviation, and it is logged. | `release/SOP.md` (this file); every step |
| **Gemba** (go and look) | The Reviewer goes to the artefact itself, not the summary: each glance item links to the hunk, the claim and the PR, and gets one mark: verified, disputed or escalated. | The reviewer's glance; step 8 |
| **Kaizen** (improve the system) | A stop or an escape opens a 5 Whys that ends in one countermeasure of seven kinds: **mutant, journey, mask review, EARS spec, claim guidance, SOP change, glance rule**. "Human error" is never an answer; it is the prompt for the next why. | The kaizen register in the harness repo (`kaizen/README.md`); steps 9, 11, 12 |

## Roles

- **Captain** runs the release and owns go/no-go. One person can captain many releases.
- **Reviewer** is a second person who authored no PR in this release. Owns the glance (step 8). Rotates every release.
- **Contributors** own their changelog lines, their claims and their EARS Rules.

## The twelve steps

| # | Step | Lean | Owner | Input | Done when | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cut the release branch and tag the candidate | Standard work | Captain | `main` at the cut commit | `release/X.Y.Z` pushed with `package.json` at X.Y.Z and `claims: []`; `pnpm release:candidate X.Y.Z` has tagged `vX.Y.Z-rc.N` and the four `X.Y.Z-rc.N` images are on quay.io | 15 min |
| 2 | Confirm a clean A/A exists | Jidoka | Captain | this machine's noise store (`HARNESS_HOME/noise`; `harness noise status`) | A clean, verified status no more than 7 days old; if not, `pnpm harness local nightly --tag <production tag>` now, or let `harness release` run its own A/A of the baseline. CI's nightly-noise.yml status is not copied in: the A/A measures the machine that ran it | 30 min if rerun |
| 3 | Write the changelog from merged PRs | Standard work | Contributors | `pnpm release:changelog` draft; PR titles; EARS files | Every merged PR has a `CHANGELOG.md` entry with its artefact hints; every new feature names its Rule id | 20 min |
| 4 | Author claims | Jidoka | Contributors | the changelog; `pnpm release:claims:draft`; [README.md](README.md) | `release/claims.yaml` updated, `pnpm check:release-claims` passes; no broad claim without `approvedBy` | 20 min |
| 5 | Run release mode | Jidoka | Captain | candidate tag, claims, noise status | `harness release` (started by step 1, or re-run as below) has written `report.html`, `report.md`, `report.json` | 45 min |
| 6 | Run rehearsals | Jidoka | Captain | tags; the fixture Postgres snapshot | Migration and upgrade modes pass (part of `harness release` unless `--fast`) | 30 min |
| 7 | Compute changes and confidence | Visual management | Captain | `report.json`, `harness changes` | `confidence.json`, `report.md` and `gate.md` written in the release-command directory, with the Gate, the score and its band | 5 min |
| 8 | Reviewer's glance | Gemba | Reviewer | the glance list (at most seven items) | Each item marked **verified**, **disputed** or **escalated** with `harness glance mark --run <release-command dir> --item <n> --mark <mark> --by <name>`, recorded in `glance-marks.jsonl` in that directory; `harness glance status` shows none unmarked | 15 min |
| 9 | Go / no-go | Jidoka | Captain | Gate, band, glance marks | The re-rendered `gate.md` posted to the release PR (`gh pr comment <n> --body-file <release-command dir>/gate.md`) and the decision recorded there: Green, go; Amber, go only with every glance item verified; Red or Gate FAIL, hold and open a 5 Whys | 10 min |
| 10 | Deploy and dispatch post-deploy | Standard work | Captain | the approved candidate | `vX.Y.Z` tagged (promotes the rc images); `pnpm deploy:pin X.Y.Z` PR merged (writes `release/deployed.json`); deploy.yml's announce job approved; harness post-deploy.yml running every 15 min | 15 min |
| 11 | Watch window | Jidoka | Captain | post-deploy runs | 24 h with no rollback issue; else roll back and open a 5 Whys | 24 h |
| 12 | Close the release | Kaizen | Captain | scoreboard line, kaizen items | Scoreboard appended; Release Hub refreshed; every open 5 Whys has an owner and a due date; the register reviewed | 15 min |

Active time is about three hours; wall time is a day and a half because of the watch window.

Steps 3 and 4 are Contributors' work, done before the candidate is cut: the changelog and the claims must be on the release branch first. The rest of steps 1 to 7 is one command, which reads them. From this repository:

```bash
pnpm release:candidate 16.3.0 --dry-run   # print every command, run none
pnpm release:candidate 16.3.0             # tag v16.3.0-rc.N, publish the images, run the harness
```

It tags the next free `vX.Y.Z-rc.N` (or reuses the one already on the commit, for example the tag release-dispatch.yml made when the branch was pushed), pushes the tag so image-build.yml publishes the four images, waits until quay.io serves them, then runs `harness release --candidate X.Y.Z-rc.N --baseline prod --monorepo <this checkout>`. The harness reads production from `release/deployed.json`. Set `HARNESS_DIR` to a harness checkout. Without it the command runs the harness through `npx github:tutors-sdk/tutors-release-harness`, and the harness's state (`HARNESS_HOME`: the noise store and the scoreboard) and the kaizen register land in npx's cache, where they do not persist. Arguments after `--` go to `harness release` (`-- --fast` for a branch smoke; its report cannot be used for a go decision). It writes everything into the release-command directory (`out/<time>-release-command/` in the harness checkout): `report.html`, `report.md`, `gate.md`, `confidence.json`. It stops at step 8 because step 8 must stay human.

The PR comment that release-harness-report.yml keeps on the release PR is CI's release-mode verdict and its unclaimed differences, not the score. The score and band are in `gate.md` and `report.md` from `harness release`, and in the harness's release.yml `scoreboard` job, published on the [report pages](https://tutors-sdk.github.io/tutors-release-harness/).

## Stop the line (andon)

- **Gate FAIL: hold.** Fix the difference or claim it with its Rule or CHANGELOG entry, then cut the next rc. The score never overrides the gate.
- **Red band: hold** and open a 5 Whys, even when the gate passes.
- **No re-running for a better number.** A re-run only adds samples and says so in the release PR: `harness release` always runs 3, so more samples are `pnpm harness local gate --a <production> --b <candidate> --runs 5`, or CI's 5 runs; a re-run to change the verdict is a deviation and is logged.
- **Rollback issue in the watch window: stop,** roll back (`pnpm deploy:pin <previous>`), and open a 5 Whys.
- **A dirty A/A: stop at step 2.** No A/B runs until the noise is explained.

## Deviations

Any step skipped, reordered or done differently is a deviation. Record it in the release PR (step, what happened, why) and add it to the kaizen register at step 12. A deviation is not blame: it is data about where this sheet does not fit the work.

## Changing this SOP

This file is versioned like code. A change is a pull request that says why and cites the 5 Whys (`kaizen/<date>-<tag>-<finding>.md` in the harness repo) that motivated it. CODEOWNERS makes the maintainers review every change. A change never lands in the release that would benefit from it.
