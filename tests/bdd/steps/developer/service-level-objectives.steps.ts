import { resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import yaml from "js-yaml";
import { expect } from "vitest";
import { REPO_ROOT, readText } from "../../../../scripts/checks/lib/repo.ts";
import { ALERTS_FILE, BURN_RATES, SLO_APPS, SLO_FILE, parseSlo, sloAlertFindings, validateSloText, type SloFile } from "../../../../scripts/checks/slo.ts";

const feature = await loadFeature("tests/bdd/features/developer/service-level-objectives.feature");

interface AlertRule {
  uid?: string;
  labels?: Record<string, string>;
  data?: { model?: { expr?: string } }[];
}

interface AlertDoc {
  groups: { rules?: AlertRule[] }[];
}

interface WorkflowJob {
  steps?: { run?: string }[];
}

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  let text: string;
  let errors: string[];
  let slo: SloFile;
  let alertsText: string;
  let findings: string[];
  let workflow: { on?: unknown; jobs: Record<string, WorkflowJob> };

  BeforeEachScenario(() => {
    text = "";
    errors = [];
    alertsText = "";
    findings = [];
  });

  const committed = () => {
    text = readText(resolve(REPO_ROOT, SLO_FILE));
    slo = parseSlo(text);
  };
  const alerts = () => {
    alertsText = readText(resolve(REPO_ROOT, ALERTS_FILE));
  };
  const objective = (kind: string, id: string, app: string, target: number, threshold?: number) => {
    text = yaml.dump({ version: 1, window: "28d", objectives: [{ id, app, kind, target, ...(threshold === undefined ? {} : { threshold }) }] });
  };
  const check = () => {
    errors = validateSloText(text);
  };
  const accepted = () => {
    expect(errors).toEqual([]);
  };
  const rejectedNaming = (_ctx: unknown, what: string) => {
    expect(errors.length, "the check rejects the file").toBeGreaterThan(0);
    expect(errors.join("\n")).toContain(what);
  };
  const alsoNaming = (_ctx: unknown, what: string) => {
    expect(errors.join("\n")).toContain(what);
  };
  const rules = () => (yaml.load(alertsText) as AlertDoc).groups.flatMap((g) => g.rules ?? []);
  const checkAlerts = () => {
    findings = sloAlertFindings(slo, alertsText);
  };
  const failedNaming = (_ctx: unknown, what: string) => {
    expect(findings.join("\n")).toContain(what);
  };

  Rule("When a maintainer checks release/slo.yaml, tutors shall accept an SLO file whose every objective names an app, a kind, a target share above 0 and under 1 and, for a latency objective, a threshold that is a bucket bound of http_request_duration_seconds.", ({ RuleScenario }) => {
    RuleScenario("The release's own file is accepted", ({ Given, When, Then }) => {
      Given("the SLO file committed at release/slo.yaml", committed);
      When("the maintainer checks the SLO file", check);
      Then("the check shall accept the SLO file", accepted);
    });

    RuleScenario("A latency objective on a bucket bound is accepted", ({ Given, When, Then }) => {
      Given("an SLO file with a {string} objective {string} for {string} with target {number} and threshold {number}", (_ctx: unknown, kind: string, id: string, app: string, target: number, threshold: number) =>
        objective(kind, id, app, target, threshold)
      );
      When("the maintainer checks the SLO file", check);
      Then("the check shall accept the SLO file", accepted);
    });
  });

  Rule("If an objective in release/slo.yaml is one the release harness cannot judge, then tutors shall reject the file and name the objective.", ({ RuleScenario }) => {
    RuleScenario("A latency threshold between bucket bounds is rejected", ({ Given, When, Then, And }) => {
      Given("an SLO file with a {string} objective {string} for {string} with target {number} and threshold {number}", (_ctx: unknown, kind: string, id: string, app: string, target: number, threshold: number) =>
        objective(kind, id, app, target, threshold)
      );
      When("the maintainer checks the SLO file", check);
      Then("the check shall reject the SLO file naming {string}", rejectedNaming);
      And("the rejection shall also name {string}", alsoNaming);
    });

    RuleScenario("A target of 1 leaves no error budget and is rejected", ({ Given, When, Then, And }) => {
      Given("an SLO file with an {string} objective {string} for {string} with target {number}", (_ctx: unknown, kind: string, id: string, app: string, target: number) => objective(kind, id, app, target));
      When("the maintainer checks the SLO file", check);
      Then("the check shall reject the SLO file naming {string}", rejectedNaming);
      And("the rejection shall also name {string}", alsoNaming);
    });

    RuleScenario("An objective for an app Tutors does not run is rejected", ({ Given, When, Then }) => {
      Given("an SLO file with an {string} objective {string} for {string} with target {number}", (_ctx: unknown, kind: string, id: string, app: string, target: number) => objective(kind, id, app, target));
      When("the maintainer checks the SLO file", check);
      Then("the check shall reject the SLO file naming {string}", rejectedNaming);
    });
  });

  Rule("Tutors shall provision, for every objective in release/slo.yaml, a one-hour and a six-hour paging burn-rate alert and a three-day ticket alert that select the objective's app alone and carry the objective's id.", ({ RuleScenario }) => {
    RuleScenario("Every objective has its three alerts, each for its own app", ({ Given, And, Then }) => {
      Given("the SLO file committed at release/slo.yaml", committed);
      And("the provisioned Grafana alerts", alerts);
      Then('every objective shall have a "page-fast", a "page-slow" and a "ticket" alert labelled with its id', () => {
        expect(BURN_RATES.map((b) => b.name)).toEqual(["page-fast", "page-slow", "ticket"]);
        for (const o of slo.objectives) {
          const mine = rules().filter((r) => r.labels?.slo === o.id);
          expect(mine.map((r) => r.uid).sort(), o.id).toEqual(BURN_RATES.map((b) => `slo-${o.id}-${b.name}`).sort());
          expect(mine.every((r) => r.labels?.app === o.app)).toBe(true);
        }
      });
      And("every alert of an objective shall select that objective's app and no other", () => {
        for (const o of slo.objectives) {
          for (const r of rules().filter((rule) => rule.labels?.slo === o.id)) {
            const expr = r.data?.[0]?.model?.expr ?? "";
            const selected = new Set([...expr.matchAll(/app="([^"]+)"/g)].map((m) => m[1]));
            expect([...selected], r.uid).toEqual([o.app]);
            // Every series in the query is selected by app: none sums across apps.
            const series = expr.match(/http_request[a-z_]*\{/g) ?? [];
            expect(series.length).toBeGreaterThan(0);
            expect(expr.match(/http_request[a-z_]*\{app="/g)?.length).toBe(series.length);
          }
        }
        expect(SLO_APPS).toContain("reader");
      });
    });
  });

  Rule("If a provisioned alert names no objective in release/slo.yaml, or differs from what the objectives generate, then tutors shall fail the SLO check and name the alert.", ({ RuleScenario }) => {
    RuleScenario("An alert with no objective is named", ({ Given, And, When, Then }) => {
      Given("the SLO file committed at release/slo.yaml", committed);
      And("the provisioned Grafana alerts with an extra alert {string} that names no objective", (_ctx: unknown, uid: string) => {
        alerts();
        const doc = yaml.load(alertsText) as AlertDoc;
        doc.groups[doc.groups.length - 1]!.rules!.push({ uid, labels: { severity: "critical" } });
        alertsText = yaml.dump(doc);
      });
      When("the maintainer checks the alerts against the SLO file", checkAlerts);
      Then("the check shall fail naming {string}", failedNaming);
    });

    RuleScenario("A threshold edited by hand is caught", ({ Given, And, When, Then }) => {
      Given("the SLO file committed at release/slo.yaml", committed);
      And("the provisioned Grafana alerts with the reader availability threshold edited by hand", () => {
        alerts();
        const edited = alertsText.replace(/\) > 0\.072 and/, ") > 0.1 and");
        expect(edited).not.toBe(alertsText);
        alertsText = edited;
      });
      When("the maintainer checks the alerts against the SLO file", checkAlerts);
      Then("the check shall fail naming {string}", failedNaming);
    });
  });

  Rule("When a release branch is pushed, tutors shall check release/slo.yaml in the same job that checks release/claims.yaml.", ({ RuleScenario }) => {
    RuleScenario("The release claims workflow checks the SLO file", ({ Given, When, Then }) => {
      Given("the release claims workflow", () => {
        workflow = yaml.load(readText(resolve(REPO_ROOT, ".github/workflows/release-claims.yml"))) as typeof workflow;
      });
      When("a release branch is pushed", () => {
        expect(JSON.stringify(workflow.on)).toContain("release/**");
      });
      Then("the job that runs {string} shall also run {string}", (_ctx: unknown, claims: string, other: string) => {
        const runs = (job: WorkflowJob) => (job.steps ?? []).map((s) => s.run?.trim() ?? "");
        const job = Object.values(workflow.jobs).find((j) => runs(j).some((r) => r.startsWith(claims)));
        expect(job, `a job runs ${claims}`).toBeDefined();
        expect(runs(job!).some((r) => r.startsWith(other))).toBe(true);
      });
    });
  });
});
