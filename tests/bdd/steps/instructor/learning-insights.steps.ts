import "../../support/svelte-runes-shim.ts";
import { readFileSync } from "node:fs";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { at, insightsWorld, plus, seedAnnotation, seedRequest } from "../../support/insights.ts";
import { recorder } from "../../support/supabase-recorder.ts";
import { readerInsightsDesk, type CourseInsights, type StepStruggle } from "../../../../packages/svelte/utils/insights/src/index.ts";
import { createInsightsService, type InsightsService } from "../../../../packages/svelte/utils/insights/src/service.svelte.ts";
import { HELP_VIEW, ANNOTATIONS_VIEW } from "../../../../packages/svelte/utils/insights/src/server/index.ts";

const feature = await loadFeature("tests/bdd/features/instructor/learning-insights.feature");

const READER = "https://reader.invalid";
const NAMES = ["alice", "bob", "carol", "dan", "erin", "frank", "gina", "hugo"];

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let labRoute: string;
  let world: ReturnType<typeof insightsWorld>;
  let signedIn: string | null;
  let service: InsightsService;
  let before: string;

  const insights = (): CourseInsights => {
    const answer = service.course.value.answer;
    if (!answer?.ok) throw new Error(`no insights: ${JSON.stringify(answer)}`);
    return answer.value;
  };
  const step = (stepId: string): StepStruggle => {
    const found = insights().steps.find((s) => s.ref.stepId === stepId);
    if (!found) throw new Error(`no step ${stepId}`);
    return found;
  };
  const day = (d: string) => insights().responseTimes.find((r) => r.day === d)!;
  const ask = (learner: string, stepId: string, kind: "stuck" | "hint" | "lecturer", d: string, ackAfter: number | null, closeAfter: number | null, reason: "resolved" | "hint" | null = null) => {
    const requestedAt = at(d, "09:00:00")!;
    seedRequest({ courseId, labRoute, stepId, learner, kind, requestedAt, acknowledgedAt: ackAfter === null ? null : plus(requestedAt, ackAfter), closedAt: closeAfter === null ? null : plus(requestedAt, closeAfter), reason });
  };
  const opens = async (login: string, span: "day" | "week" | "month", ending: string) => {
    signedIn = login;
    await service.choose(span, ending);
    await service.openCourse(courseId);
  };

  const teaches = (_ctx: unknown, educator: string) => world.teach(courseId, [educator]);
  const fiveAsked = (_ctx: unknown, count: number, stepId: string, d: string) => {
    for (let i = 0; i < count; i++) ask(NAMES[i], stepId, "stuck", d, (i + 1) * 60, null);
  };
  const askedAcknowledged = (_ctx: unknown, learner: string, stepId: string, d: string, amount: number, unit: string) =>
    ask(learner, stepId, "stuck", d, unit.startsWith("minute") ? amount * 60 : amount, null);
  const askedHint = (_ctx: unknown, learner: string, stepId: string, d: string, minutes: number) => ask(learner, stepId, "hint", d, null, minutes * 60, "hint");
  const opensDay = (_ctx: unknown, login: string, d: string) => opens(login, "day", d);
  const opensWeek = (_ctx: unknown, login: string, d: string) => opens(login, "week", d);
  const ranked = (_ctx: unknown, order: string) => expect(insights().steps.map((s) => s.ref.stepId).join(", ")).toBe(order);
  const showsMedian = (_ctx: unknown, stepId: string, total: number, median: number) => {
    expect(step(stepId).total).toBe(total);
    expect(step(stepId).medianWaitSeconds).toBe(median);
  };
  const showsNoMedian = (_ctx: unknown, stepId: string, total: number) => {
    expect(step(stepId).total).toBe(total);
    expect(step(stepId).medianWaitSeconds).toBeNull();
    expect(step(stepId).p90WaitSeconds).toBeNull();
  };
  const hintWithheld = (_ctx: unknown, d: string, kind: "hint") => {
    expect(day(d).times[kind].resolve).toEqual({ count: 1, median: null, p90: null });
  };
  const broadcasts = (_ctx: unknown, _author: string, count: number, stepId: string, d: string) => {
    for (let i = 0; i < count; i++) seedAnnotation({ courseId, labRoute, stepId, learner: null, createdAt: at(d, "10:00:00")! });
  };
  const saysOnlyCounts = () => expect(insights().cohort.percentilesShown).toBe(false);
  const saysNotOnlyCounts = () => expect(insights().cohort.percentilesShown).toBe(true);

  Background(({ Given }) => {
    Given("the course {string} with the lab {string}", (_ctx, id: string, lab: string) => {
      recorder.reset();
      courseId = id;
      labRoute = lab;
      world = insightsWorld();
      signedIn = null;
      // Tutors Time's service over the reader's insights API, asked as whoever is signed in.
      const desk = readerInsightsDesk(READER, (input) => world.serve(signedIn, String(input)));
      service = createInsightsService({ desk, now: () => new Date("2026-01-05T12:00:00.000Z") });
    });
  });

  Rule("Tutors shall compute insights only from stored help requests and lecturer annotations through one read port, never writing.", ({ RuleScenario }) => {
    RuleScenario("Insights read the views and leave the records as they were", ({ Given, And, When, Then }) => {
      Given("{string} teaches the course", teaches);
      And("{string} asked for a hint at the step {string} on {string}, answered with a hint after {number} minutes", (ctx, ...args: [string, string, string, number]) => {
        askedHint(ctx, ...args);
        before = JSON.stringify(recorder.rows("assistance_requests"));
      });
      When("{string} opens the course's insights for the day {string}", opensDay);
      Then("tutors shall have read only the insights views", () => {
        expect(recorder.tableCalls.length).toBeGreaterThan(0);
        expect(new Set(recorder.tableCalls.map((c) => c.table))).toEqual(new Set([HELP_VIEW, ANNOTATIONS_VIEW]));
        expect(recorder.tableCalls.every((c) => c.op === "select")).toBe(true);
        expect(recorder.rpcCalls).toEqual([]);
      });
      And("the stored records shall be unchanged", () => expect(JSON.stringify(recorder.rows("assistance_requests"))).toBe(before));
    });
  });

  Rule(
    "Tutors shall compute a step diagnostic as requests by kind, acknowledged count, median and 90th percentile waiting seconds, helped answers and annotations for a step and day.",
    ({ RuleScenario }) => {
      RuleScenario("A step's day in numbers", ({ Given, And, When, Then }) => {
        Given("{string} teaches the course", teaches);
        And("these students asked for help at the step {string} on {string}", (_ctx, stepId: string, d: string, table: Record<string, string>[]) => {
          for (const row of table) {
            seedRequest({
              courseId,
              labRoute,
              stepId,
              learner: row.learner,
              kind: row.kind as "stuck",
              requestedAt: at(d, row.requested)!,
              acknowledgedAt: at(d, row.acknowledged),
              closedAt: at(d, row.closed),
              reason: (row.reason || null) as "resolved" | null
            });
          }
        });
        And("{string} asked for help at the step {string} on {string}, acknowledged after {number} seconds", (ctx, l: string, s: string, d: string, n: number) => askedAcknowledged(ctx, l, s, d, n, "seconds"));
        And("{string} broadcast {number} explanations at the step {string} on {string}", broadcasts);
        When("{string} opens the course's insights for the day {string}", opensDay);
        Then("the step {string} shall count {number} {string}, {number} {string} and {number} {string} requests", (_ctx, stepId: string, a: number, ka: string, b: number, kb: string, c: number, kc: string) => {
          expect(step(stepId).requests).toEqual({ [ka]: a, [kb]: b, [kc]: c });
        });
        And("the step {string} shall count {number} acknowledged, {number} helped by a hint and {number} annotations", (_ctx, stepId: string, ack: number, hint: number, notes: number) => {
          expect(step(stepId)).toMatchObject({ acknowledged: ack, helpedByHint: hint, annotations: notes });
        });
        And("the step {string} shall show a median wait of {number} seconds and a 90th percentile wait of {number} seconds", (_ctx, stepId: string, median: number, p90: number) => {
          expect(step(stepId)).toMatchObject({ medianWaitSeconds: median, p90WaitSeconds: p90 });
        });
      });
    }
  );

  Rule("When an educator opens a course's insights, tutors shall rank its lab steps by requests and waiting time for the chosen day, week or month.", ({ RuleScenario }) => {
    RuleScenario("The step most students asked about comes first, and the week reaches further back than the day", ({ Given, And, When, Then }) => {
      Given("{string} teaches the course", teaches);
      And("{number} students each asked for help at the step {string} on {string}, acknowledged after {number} to {number} minutes", fiveAsked);
      And("{string} asked for help at the step {string} on {string}, acknowledged after {number} seconds", (ctx, l: string, s: string, d: string, n: number) => askedAcknowledged(ctx, l, s, d, n, "seconds"));
      And("{string} asked for help at the step {string} on {string}, acknowledged after {number} minutes", (ctx, l: string, s: string, d: string, n: number) => askedAcknowledged(ctx, l, s, d, n, "minutes"));
      When("{string} opens the course's insights for the day {string}", opensDay);
      Then("the steps shall be ranked {string}", ranked);
      And("the step {string} shall show {number} requests with a median wait of {number} seconds", showsMedian);
      When("{string} chooses {number} days", async () => {
        await service.choose("week");
      });
      Then("the steps over the {number} days shall be ranked {string}", (ctx, _days: number, order: string) => ranked(ctx, order));
    });

    RuleScenario("Equal requests rank the longer wait first", ({ Given, And, When, Then }) => {
      Given("{string} teaches the course", teaches);
      And("these students asked for help on {string}", (_ctx, d: string, table: Record<string, string>[]) => {
        for (const row of table) ask(row.learner, row.step, "stuck", d, Number(row.waited), null);
      });
      When("{string} opens the course's insights for the day {string}", opensDay);
      Then("the steps shall be ranked {string}", ranked);
    });

    RuleScenario("A student cannot open the course's insights", ({ Given, And, When, Then }) => {
      Given("{string} teaches the course", teaches);
      And("{string} asked for help at the step {string} on {string}, acknowledged after {number} seconds", (ctx, l: string, s: string, d: string, n: number) => askedAcknowledged(ctx, l, s, d, n, "seconds"));
      When("{string} opens the course's insights for the day {string}", opensDay);
      Then("the insights page shall say {string} and rank no step", (_ctx, reason: string) => {
        expect(service.course.value.answer).toEqual({ ok: false, reason });
        expect(recorder.tableCalls).toEqual([]);
      });
    });
  });

  Rule("Tutors shall report time to acknowledge and time to resolve as median and 90th percentile per day and per kind of help.", ({ RuleScenario }) => {
    RuleScenario("Each day and kind has its own times", ({ Given, And, When, Then }) => {
      Given("{string} teaches the course", teaches);
      And("{number} students each asked for help at the step {string} on {string}, acknowledged after {number} to {number} minutes", fiveAsked);
      And("{string} asked for a hint at the step {string} on {string}, answered with a hint after {number} minutes", askedHint);
      When("{string} opens the course's insights for {number} days ending {string}", (ctx, login: string, _days: number, d: string) => opensWeek(ctx, login, d));
      Then("the response times of {string} for {string} shall be {number} resolved, its percentiles withheld", (ctx, d: string, kind: "hint") => hintWithheld(ctx, d, kind));
      And(
        "the response times of {string} for {string} shall be {number} acknowledged with a median of {number} seconds and a 90th percentile of {number} seconds",
        (_ctx, d: string, kind: "stuck", count: number, median: number, p90: number) => {
          expect(day(d).times[kind].acknowledge).toEqual({ count, median, p90 });
        }
      );
      And("the response times of {string} shall have none for {string}", (_ctx, d: string, kind: "hint") => {
        expect(day(d).times[kind].acknowledge.count + day(d).times[kind].resolve.count).toBe(0);
      });
    });
  });

  Rule("Tutors shall show on a student's page their requests raised, hints read and annotations received beside the existing calendar and lab analytics.", ({ RuleScenario }) => {
    RuleScenario("A student's part in the course", ({ Given, And, When, Then }) => {
      Given("{string} teaches the course", teaches);
      And("{string} asked for a hint at the step {string} on {string}, answered with a hint after {number} minutes", askedHint);
      And("{string} asked for help at the step {string} on {string}, acknowledged after {number} seconds", (ctx, l: string, s: string, d: string, n: number) => askedAcknowledged(ctx, l, s, d, n, "seconds"));
      And("{string} wrote an annotation to {string} at the step {string} on {string}", (_ctx, _author: string, learner: string, stepId: string, d: string) => {
        seedAnnotation({ courseId, labRoute, stepId, learner, createdAt: at(d, "11:00:00")! });
      });
      And("{string} broadcast an explanation at each of the steps {string} and {string} on {string}", (ctx, author: string, a: string, b: string, d: string) => {
        broadcasts(ctx, author, 1, a, d);
        broadcasts(ctx, author, 1, b, d);
      });
      When("{string} opens the student page of {string} for {number} days ending {string}", async (_ctx, login: string, learner: string, _days: number, d: string) => {
        signedIn = login;
        await service.choose("month", d);
        await service.openStudent(courseId, learner);
      });
      Then("the page shall show {number} requests raised, {number} hint read and {number} annotations received", (_ctx, raised: number, hints: number, received: number) => {
        const answer = service.student.value.answer;
        expect(answer?.ok && answer.value).toEqual({ learnerId: "frank", requestsRaised: raised, hintsRead: hints, annotationsReceived: received });
      });
      And("the student page shall carry the help and feedback panel after the calendar and lab analytics", () => {
        const page = readFileSync("apps/time/src/routes/[courseid]/[studentid]/+page.svelte", "utf8");
        const panel = page.indexOf("<StudentInsights");
        expect(panel).toBeGreaterThan(page.indexOf("<Tables"));
        expect(page.indexOf("<Tables")).toBeGreaterThan(page.indexOf("<HeatMaps"));
        // Outside the calendar's {#if}: the panel shows whatever the calendar holds.
        expect(page.slice(page.lastIndexOf("{/if}", panel), panel)).not.toContain("{:else");
      });
    });
  });

  Rule("While a course has fewer than 5 students with records in the chosen period, tutors shall show counts and withhold percentiles.", ({ RuleScenario }) => {
    RuleScenario("Four students: counts only", ({ Given, And, When, Then }) => {
      Given("{string} teaches the course", teaches);
      And("{number} students each asked for help at the step {string} on {string}, acknowledged after {number} to {number} minutes", fiveAsked);
      When("{string} opens the course's insights for the day {string}", opensDay);
      Then("the step {string} shall show {number} requests and no median or 90th percentile wait", showsNoMedian);
      And("the response times shall show counts and no percentiles", () => {
        const stuck = day("2026-01-05").times.stuck.acknowledge;
        expect(stuck).toEqual({ count: 4, median: null, p90: null });
      });
      And("the page shall say that only counts are shown", saysOnlyCounts);
    });

    RuleScenario("Five students: percentiles are shown", ({ Given, And, When, Then }) => {
      Given("{string} teaches the course", teaches);
      And("{number} students each asked for help at the step {string} on {string}, acknowledged after {number} to {number} minutes", fiveAsked);
      When("{string} opens the course's insights for the day {string}", opensDay);
      Then("the step {string} shall show {number} requests with a median wait of {number} seconds", showsMedian);
      And("the page shall not say that only counts are shown", saysNotOnlyCounts);
    });
  });

  Rule("Tutors shall name every insights view in ARCHITECTURE.md with the module that reads it.", ({ RuleScenario }) => {
    RuleScenario("The insights views are in the architecture document", ({ Given, Then }) => {
      let doc = "";
      Given("the architecture document", () => {
        doc = readFileSync("ARCHITECTURE.md", "utf8");
      });
      Then("it shall name {string} and {string} with {string}", (_ctx, a: string, b: string, owner: string) => {
        for (const view of [a, b]) {
          const line = doc.split("\n").find((l) => l.includes(`\`${view}\``));
          expect(line, view).toBeDefined();
          expect(line).toContain(owner);
        }
      });
    });
  });

  Rule(
    "Tutors shall withhold the median and 90th percentile of a step, or of a kind of help on a day, whose requests came from fewer than 5 students, whatever the size of the course's cohort.",
    ({ RuleScenario }) => {
      RuleScenario("One student's step and kind show counts only beside five who asked", ({ Given, And, When, Then }) => {
        Given("{string} teaches the course", teaches);
        And("{number} students each asked for help at the step {string} on {string}, acknowledged after {number} to {number} minutes", fiveAsked);
        And("{string} asked for a hint at the step {string} on {string}, answered with a hint after {number} minutes", askedHint);
        When("{string} opens the course's insights for the day {string}", opensDay);
        Then("the step {string} shall show {number} requests with a median wait of {number} seconds", showsMedian);
        And("the step {string} shall show {number} requests and no median or 90th percentile wait", showsNoMedian);
        And("the response times of {string} for {string} shall be {number} resolved, its percentiles withheld", (ctx, d: string, kind: "hint") => hintWithheld(ctx, d, kind));
        And("the page shall not say that only counts are shown", saysNotOnlyCounts);
      });
    }
  );
});
