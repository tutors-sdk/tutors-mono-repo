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
| `reason` | The Rule id or CHANGELOG entry behind the change. "see PR", "approved" and the like are rejected |
| `approvedBy` | Required on a broad claim (`artefact: "*"`, `scope: "*"` or `"**"`): a person, never a bot |

Claim precisely. `claims: []` is valid and means nothing observable should differ from production, which is the right file for a release of internal changes only.

## When it is read

Every push to a `release/**` branch whose `package.json` version matches the branch tags the next `vX.Y.Z-rc.N` and sends the harness the raw URL of this file at the tagged commit (`.github/workflows/release-dispatch.yml`). The file is checked for shape on the same push and on the release PR (`.github/workflows/release-claims.yml`, or `pnpm check:release-claims` locally). The flow is described in [guides/Release-Strategy.md](../guides/Release-Strategy.md#release-harness).

Reset the list to `claims: []` when the next release branch is cut. `tests/generator/claims.yaml` is a different file: it claims changes to generated course output, not to the running apps.
