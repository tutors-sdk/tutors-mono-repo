# Service level objectives

Issue #170. What the Tutors apps aim for, how much failure that leaves room for, what pages someone,
and what they do when it does. The objectives live in [`release/slo.yaml`](../release/slo.yaml); this
page explains them. Rules 0295 to 0299 (`tests/bdd/features/developer/service-level-objectives.feature`).

**The targets are indicative.** They are what the college aims for, not a contract: it may never want
"99s", and they will move as real traffic says what is achievable. Two things read them:

- **Production alerting.** `observability/grafana/provisioning/alerting/alerts.yml` is generated from
  `release/slo.yaml` (`pnpm slo:alerts`), so every alert maps to an objective and no threshold drifts
  from its target. `pnpm check:slo` fails when the two differ.
- **The release harness** (harness 1.34.0 and later) fetches `slo.yaml` from beside
  `release/claims.yaml` and judges each candidate against it. The harness keeps its own, **stricter**
  floors (`slo/floors.yaml` there: 99.9% not 5xx and 99% under 1s, for every app) and judges the
  stricter of the two; it also reports a candidate significantly worse than production even when the
  target is met. Lowering a number here loosens production paging, never a release.

## The indicators

Both come from the series every app exports (pinned by `tests/observability/observability-contracts.test.ts`),
selected per app by the `app` label the scrape adds (the local Prometheus sets it per target; the
Kubernetes ServiceMonitor takes it from the overlay's `app.kubernetes.io/component`).

| Kind | Good requests | PromQL, bad share over a window |
| --- | --- | --- |
| availability | responses that are not 5xx | `sum(rate(http_requests_total{app="reader",status_code=~"5.."}[1h])) / sum(rate(http_requests_total{app="reader"}[1h]))` |
| latency | requests at or under the threshold | `1 - sum(rate(http_request_duration_seconds_bucket{app="reader",le="1"}[1h])) / sum(rate(http_request_duration_seconds_count{app="reader"}[1h]))` |

A latency threshold must be a bucket bound of `http_request_duration_seconds` (0.01, 0.05, 0.1, 0.25,
0.5, 1, 2.5, 5, 10), or the indicator could only be estimated.

## The objectives

Over a rolling 28-day window. The reader is strictest: it is what a student is reading.

| Objective | App | Target | Error budget in 28 days |
| --- | --- | --- | --- |
| `reader-availability` | reader | 99.5% not 5xx | 0.5%, about 3h22m of total failure |
| `reader-latency` | reader | 95% under 1s | 5% of requests slower |
| `reader-latency-tail` | reader | 99% under 2.5s | 1% of requests slower |
| `catalogue-availability`, `live-availability`, `time-availability` | each | 99% not 5xx | 1%, about 6h43m |
| `catalogue-latency`, `live-latency`, `time-latency` | each | 95% under 1s | 5% of requests slower |

## Alerts: burn rates, not thresholds

The old alerts (5xx above 5%, p99 above 5s, both summed over all four apps) are gone: a broken
reader could hide behind three healthy apps, and neither number was tied to a target. Each objective
now has three multi-window burn-rate alerts for its app alone, labelled `slo: <id>` and `app`:

| Alert | Fires while the bad share exceeds | Over both | Means | Severity |
| --- | --- | --- | --- | --- |
| `slo-<id>-page-fast` | 14.4 × the budget | 1h and 5m | 2% of the month's budget gone in an hour | page (`critical`) |
| `slo-<id>-page-slow` | 6 × the budget | 6h and 30m | 5% gone in six hours | page (`critical`) |
| `slo-<id>-ticket` | 1 × the budget | 3d and 6h | on course to spend it all | ticket (`warning`) |

The short window stops an alert soon after the burn does. No traffic is no burn (`noDataState: OK`).
`healthz-failing` stays as it was: an app that is down altogether.

## Error-budget policy

Proposed in issue #170 and agreed when this page merges; it applies to production, as the alerts and the window measure it.

- **Budget left over half:** release as normal.
- **More than half spent:** only low-risk releases (fixes, dependency patches, copy); anything that
  touches a hot path waits or ships behind a flag.
- **Spent:** freeze feature releases for the app until the window recovers. Fixes and rollbacks only,
  and the next release's notes say what spent it.
- A page is an incident: the on-call person (Grafana contact point `tutors-oncall`) acknowledges it,
  follows the runbook below, and writes up anything that spent more than 10% of a budget.

## Runbook

Every alert links here by objective. First, for any of them: open the Tutors dashboard
(`observability/grafana/dashboards/tutors-overview.json`), find the app, and check whether a deploy
landed when the burn started (`release/deployed.json` on main, the deploy job's log). A burn that
started with a deploy is rolled back first and diagnosed after.

### reader-availability

5xx from the reader. Look at the reader's error logs (`level: error`, `loadError: true` on
`request.completed`): a course host that is down shows as load errors for one course; errors across
every course point at the reader itself or Supabase. Roll back a deploy that started it.

### reader-latency

The reader is slow for many requests. Check the course host's response time first (the reader fetches
`tutors.json` per course), then Supabase, then the pod's CPU and memory limits.

### reader-latency-tail

The slowest 1% of reader requests passed 2.5s. Usually one large course or one slow route: group the
`request.completed` lines by `route` and sort by `duration_ms`.

### catalogue-availability

### live-availability

### time-availability

5xx from that app. Its error logs first; time and live depend on Supabase, so check its status page.
Roll back a deploy that started it.

### catalogue-latency

### live-latency

### time-latency

That app is slow. Check Supabase latency (live, time), then the pod's limits.
