# release/

Files a release carries for the [release harness](https://github.com/tutors-sdk/tutors-release-harness), which compares the production images with a release candidate's images before the release ships.

| File | Purpose |
| --- | --- |
| `claims.yaml` | The differences this release intends. The harness fails on any observable difference that no claim covers, and reports claims that match nothing as stale. |

## Writing a claim

```yaml
claims:
  - artefact: dom
    scope: "reader:lab-step*"
    reason: "Rule 0031: lab steps shall show estimated reading time"
```

| Field | Meaning |
| --- | --- |
| `artefact` | `dom`, `screenshot`, `network`, `console`, `headers`, `axe`, `focus`, `metrics`, `logs`, `timing`, `persistence`, `bus`, `migration`, `upgrade`, `image-manifest`, `sbom`, `vulns`, `runtime`, `startup`, or `"*"` (the harness's vocabulary as of harness 1.3.0, in its order; `migration` is how a contract migration is claimed, see [guides/MIGRATIONS.md](../guides/MIGRATIONS.md); `image-manifest`, `sbom`, `vulns`, `runtime` and `startup` are read from the images and the running containers). `pnpm check:release-claims` accepts exactly this list, and a test fails if it drifts from the harness's |
| `scope` | A glob over what changed: a page key (`reader:lab-step`), a route, `GET /api/presence`, `reader:*/content-security-policy`, `<app>/<series>` |
| `reason` | The Rule id or CHANGELOG entry behind the change. "see PR", "approved" and the like are rejected. Optional when the claim has a `rule` |
| `rule` | Optional, harness contract 1.3.0. The id of the Rule behind the change, in quotes: `rule: "0031"`. It must be a Rule the release defines (see [Rules the release defines](#rules-the-release-defines)) |
| `approvedBy` | Required on a broad claim (`artefact: "*"`, `scope: "*"` or `"**"`): a person, never a bot |

A claim can name its Rule with the field instead of the reason:

```yaml
claims:
  - artefact: dom
    scope: "reader:lab-step*"
    rule: "0031"
```

`pnpm check:release-claims` resolves both forms against the Rules in `tests/bdd/features` and fails on an id no feature defines. A claim whose `reason` starts "Rule 0031" and also has a `rule` must name the same Rule. A reason that names a CHANGELOG entry stays free text. The `rule` field needs a harness that speaks contract 1.3.0. An earlier harness (contract 1.2.0 or before) does not reject the key: its claims schema ignores unknown keys, so a claim with a `reason` and a `rule` passes and the `rule` is dropped. A claim with only a `rule` fails there because `reason` is then missing (it is required before 1.3.0). So keep to `reason: "Rule 0031: ..."` until the harness release path is 1.3.0 or later; a claim with only a `rule` needs 1.3.0.

## Writing claims from the changelog

A changelog entry names the artefacts it expects to move, so it turns into a claim in one line. The convention is in [CONTRIBUTING.md](../CONTRIBUTING.md#changelog-entries):

```markdown
- Nav bar: link contrast raised to 4.5:1 on the dark theme (axe, dom) (PR #301)
```

becomes

```yaml
claims:
  - artefact: axe
    scope: "reader:*"
    reason: "CHANGELOG 16.4.0: Nav bar: link contrast raised to 4.5:1 on the dark theme"
  - artefact: dom
    scope: "reader:*"
    reason: "CHANGELOG 16.4.0: Nav bar: link contrast raised to 4.5:1 on the dark theme"
```

One claim per artefact in the hint; the scope is the page key, route, `<METHOD> <route>` or `<app>/<series>` the entry names (narrow it as far as the entry allows). A changelog entry with no artefact hint claims nothing: if the harness then finds a difference, the entry was incomplete, and that is the signal.

Claim precisely. `claims: []` is valid and means nothing observable should differ from production, which is the right file for a release of internal changes only.

## Rules the release defines

`pnpm release:rules [--ref <git ref>] [--out <path>]` writes `rules.json` for the Rules at a git ref (default `HEAD`), read from git and not from the working tree:

```json
{
  "version": 1,
  "rules": {
    "0031": { "title": "When a student opens a lab step, the reader shall ...", "digest": "698c90a5..." }
  }
}
```

There is one entry per Rule that carries exactly one `@rule-NNNN` tag. Keys are sorted by id and nothing else goes in the file (no time, no path), so the same ref gives the same bytes on every machine. The `digest` covers the Rule block (tags, title, scenarios, steps) with whitespace and comments ignored: it changes when the Rule's meaning changes and not when the file is reformatted or the Rule moves. The harness resolves a claim's `rule` against this file, from `--rules <file>` locally or the `rules_url` of the dispatch. Publish it for the candidate's commit (`pnpm release:rules --ref vX.Y.Z-rc.N --out rules.json`).

`pnpm check:release-claims --ref <ref>` checks the claims against the Rules at that ref instead of the working tree. To start a claims file from the Rules that changed, `pnpm release:claims:draft --from <production tag> --to <candidate ref>` prints a stub per added or changed Rule; add `--rule` for stubs that use the `rule` field.

## The verdict on the pull request

The harness never writes to a pull request, so `.github/workflows/release-harness-report.yml` posts what it found. After `release-dispatch.yml` sends a candidate to the harness, that workflow waits for the harness's run (up to 45 minutes), reads the `release-report` artifact and creates or updates **one** comment on the open release pull request, marked `<!-- tutors-release-harness-report -->`. A new candidate rewrites the same comment; it is never joined by another.

The comment states the verdict and the harness's exit code (`PASS`; `WARN (advisory)`, exit 0, nothing blocked; `FAIL`, exit 1; `COULD NOT JUDGE`, exit 2, nothing was compared), the harness version, the images and digests it judged for production and the candidate (all four apps), how many differences were claimed, unclaimed and stale, the first ten unclaimed differences, and links to the run and the report artifact. **A claim you write in `claims.yaml` is what turns an unclaimed difference into a claimed one**: read the list, then either fix the difference or claim it with its Rule (`rule`) or CHANGELOG entry (`reason`) and push again.

If the pull request does not exist yet when the run finishes, nothing is posted and the workflow's summary says so; open the pull request and start `release-harness-report.yml` again. What it needs from the harness (a `run-name` naming the candidate; the `release-report` artifact) and from `HARNESS_TOKEN` (Actions: read on the harness repository) is in [guides/Release-Strategy.md](../guides/Release-Strategy.md#the-harness-verdict-on-the-release-pr).

## When it is read

Every push to a `release/**` branch whose `package.json` version matches the branch tags the next `vX.Y.Z-rc.N` and sends the harness the raw URL of this file at the tagged commit (`.github/workflows/release-dispatch.yml`), with the Rules the release defines (`rules_url`) and the digests of both sides' images. The file is checked for shape on the same push and on the release PR (`.github/workflows/release-claims.yml`, or `pnpm check:release-claims` locally). The flow is described in [guides/Release-Strategy.md](../guides/Release-Strategy.md#release-harness).

Reset the list to `claims: []` when the next release branch is cut. `tests/generator/claims.yaml` is a different file: it claims changes to generated course output, not to the running apps.
