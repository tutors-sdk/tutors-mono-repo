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
| `artefact` | `dom`, `screenshot`, `network`, `console`, `headers`, `axe`, `metrics`, `logs`, `timing`, or `"*"` |
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

`pnpm check:release-claims` resolves both forms against the Rules in `tests/bdd/features` and fails on an id no feature defines. A claim whose `reason` starts "Rule 0031" and also has a `rule` must name the same Rule. A reason that names a CHANGELOG entry stays free text. The `rule` field needs a harness that speaks contract 1.3.0; an earlier harness rejects the claims file for an unknown field, so keep to `reason: "Rule 0031: ..."` until then.

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

## When it is read

Every push to a `release/**` branch whose `package.json` version matches the branch tags the next `vX.Y.Z-rc.N` and sends the harness the raw URL of this file at the tagged commit (`.github/workflows/release-dispatch.yml`). The file is checked for shape on the same push and on the release PR (`.github/workflows/release-claims.yml`, or `pnpm check:release-claims` locally). The flow is described in [guides/Release-Strategy.md](../guides/Release-Strategy.md#release-harness).

Reset the list to `claims: []` when the next release branch is cut. `tests/generator/claims.yaml` is a different file: it claims changes to generated course output, not to the running apps.
