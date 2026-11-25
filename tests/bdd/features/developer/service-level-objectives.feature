@developer
Feature: Service level objectives
  As the person on call for Tutors
  I want each app's availability and latency targets written once, with the alerts that page on them generated from them
  So that every alert maps to an objective, a broken reader cannot hide behind three healthy apps, and the release harness judges a candidate against the same targets

  The objectives are release/slo.yaml (issue #170, docs/slo.md). They are indicative: what the college aims for. The release
  harness (tutors-sdk/tutors-release-harness, harness 1.34.0) fetches the file from beside release/claims.yaml, judges each
  candidate against the stricter of it and its own floors, and refuses a file it cannot use before any stack starts. The
  command is scripts/checks/slo.ts (pnpm check:slo), which holds the same rules so a release push fails first, and which
  writes observability/grafana/provisioning/alerting/alerts.yml (pnpm slo:alerts).

  @rule-0295 @ears-event-driven
  Rule: When a maintainer checks release/slo.yaml, tutors shall accept an SLO file whose every objective names an app, a kind, a target share above 0 and under 1 and, for a latency objective, a threshold that is a bucket bound of http_request_duration_seconds.

    Scenario: The release's own file is accepted
      Given the SLO file committed at release/slo.yaml
      When the maintainer checks the SLO file
      Then the check shall accept the SLO file

    Scenario: A latency objective on a bucket bound is accepted
      Given an SLO file with a "latency" objective "reader-latency" for "reader" with target 0.95 and threshold 2.5
      When the maintainer checks the SLO file
      Then the check shall accept the SLO file

  @rule-0296 @ears-unwanted
  Rule: If an objective in release/slo.yaml is one the release harness cannot judge, then tutors shall reject the file and name the objective.

    Scenario: A latency threshold between bucket bounds is rejected
      Given an SLO file with a "latency" objective "reader-latency" for "reader" with target 0.95 and threshold 0.75
      When the maintainer checks the SLO file
      Then the check shall reject the SLO file naming "objective 1 (reader-latency)"
      And the rejection shall also name "bucket bound"

    Scenario: A target of 1 leaves no error budget and is rejected
      Given an SLO file with an "availability" objective "reader-availability" for "reader" with target 1
      When the maintainer checks the SLO file
      Then the check shall reject the SLO file naming "objective 1 (reader-availability)"
      And the rejection shall also name "no error budget"

    Scenario: An objective for an app Tutors does not run is rejected
      Given an SLO file with an "availability" objective "website-availability" for "website" with target 0.99
      When the maintainer checks the SLO file
      Then the check shall reject the SLO file naming "objective 1 (website-availability)"

  @rule-0297 @ears-ubiquitous
  Rule: Tutors shall provision, for every objective in release/slo.yaml, a one-hour and a six-hour paging burn-rate alert and a three-day ticket alert that select the objective's app alone and carry the objective's id.

    Scenario: Every objective has its three alerts, each for its own app
      Given the SLO file committed at release/slo.yaml
      And the provisioned Grafana alerts
      Then every objective shall have a "page-fast", a "page-slow" and a "ticket" alert labelled with its id
      And every alert of an objective shall select that objective's app and no other

  @rule-0298 @ears-unwanted
  Rule: If a provisioned alert names no objective in release/slo.yaml, or differs from what the objectives generate, then tutors shall fail the SLO check and name the alert.

    Scenario: An alert with no objective is named
      Given the SLO file committed at release/slo.yaml
      And the provisioned Grafana alerts with an extra alert "high-error-rate" that names no objective
      When the maintainer checks the alerts against the SLO file
      Then the check shall fail naming "alert high-error-rate names no objective"

    Scenario: A threshold edited by hand is caught
      Given the SLO file committed at release/slo.yaml
      And the provisioned Grafana alerts with the reader availability threshold edited by hand
      When the maintainer checks the alerts against the SLO file
      Then the check shall fail naming "run pnpm slo:alerts"

  @rule-0299 @ears-event-driven
  Rule: When a release branch is pushed, tutors shall check release/slo.yaml in the same job that checks release/claims.yaml.

    Scenario: The release claims workflow checks the SLO file
      Given the release claims workflow
      When a release branch is pushed
      Then the job that runs "pnpm check:release-claims" shall also run "pnpm check:slo"

  @rule-0574 @ears-event-driven
  Rule: When an app starts, tutors shall expose its availability and latency SLIs on /metrics, http_requests_total and the http_request_duration_seconds buckets at zero, before the app has served a request.

    Scenario: An app that has served no request already carries both SLIs
      Given an app that has just started and served no request
      When its /metrics is scraped
      Then the scrape shall carry "http_requests_total" at 0
      And the scrape shall carry "http_request_duration_seconds_bucket" at le "1" and le "+Inf", each at 0

    Scenario: The first request counts once against the SLIs
      Given an app that has just started and served no request
      When it answers a request for an unmatched path with 404
      And its /metrics is scraped
      Then the scrape shall carry "http_requests_total" at 1

    Scenario: Every app serves the shared SLIs on /metrics
      Given the four apps "reader, catalogue, live, time"
      Then each app's /metrics route shall serve the shared metrics registry
      And each app's request hooks shall count every request with the shared metrics middleware
