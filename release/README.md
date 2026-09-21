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
| `artefact` | `dom`, `screenshot`, `network`, `console`, `headers`, `axe`, `focus`, `metrics`, `logs`, `timing`, `persistence`, `migration`, `upgrade`, or `"*"` (the harness's vocabulary; `migration` is how a contract migration is claimed, see [guides/MIGRATIONS.md](../guides/MIGRATIONS.md)) |
| `scope` | A glob over what changed: a page key (`reader:lab-step`), a route, `GET /api/presence`, `reader:*/content-security-policy`, `<app>/<series>` |
| `reason` | The Rule id or CHANGELOG entry behind the change. "see PR", "approved" and the like are rejected |
| `approvedBy` | Required on a broad claim (`artefact: "*"`, `scope: "*"` or `"**"`): a person, never a bot |

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

## When it is read

Every push to a `release/**` branch whose `package.json` version matches the branch tags the next `vX.Y.Z-rc.N` and sends the harness the raw URL of this file at the tagged commit (`.github/workflows/release-dispatch.yml`). The file is checked for shape on the same push and on the release PR (`.github/workflows/release-claims.yml`, or `pnpm check:release-claims` locally). The flow is described in [guides/Release-Strategy.md](../guides/Release-Strategy.md#release-harness).

Reset the list to `claims: []` when the next release branch is cut. `tests/generator/claims.yaml` is a different file: it claims changes to generated course output, not to the running apps.
