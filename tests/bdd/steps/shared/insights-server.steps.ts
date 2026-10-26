import "../../support/svelte-runes-shim.ts";
import { readFileSync, readdirSync } from "node:fs";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase, the environments and the course's published tutors.json. Everything between
// them and the reader's route handlers is product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({
  createClient: (await import("../../support/supabase-recorder.ts")).createClient
}));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$app/env/public", async () => ({ ...(await import("../../support/supabase-recorder.ts")).publicEnv, PUBLIC_TIME_ORIGIN: "https://time.invalid" }));
vi.mock("$app/env/private", () => ({ PRIVATE_SUPABASE_SERVICE_ROLE_KEY: "service-role-key" }));

import { GET as getInsights, OPTIONS as preflight } from "../../../../apps/reader/src/routes/api/insights/+server.ts";
import { GET as getQueue } from "../../../../apps/reader/src/routes/api/assistance/+server.ts";
import { tutorsJsonUrl } from "../../../../apps/reader/src/lib/server/assistance.ts";
import { courseJsonUrl } from "../../../../packages/svelte/utils/feedback/src/server/index.ts";
import { readerInsightsDesk, type CourseInsights } from "../../../../packages/svelte/utils/insights/src/index.ts";
import { ANNOTATIONS_VIEW, HELP_VIEW } from "../../../../packages/svelte/utils/insights/src/server/index.ts";
import { REFUSAL_MESSAGES } from "../../../../apps/time/src/lib/components/insights/format.ts";
import en from "../../../../packages/svelte/utils/i18n/src/messages/en.ts";
import { at, FREE_TEXT, plus, seedAnnotation, seedRequest } from "../../support/insights.ts";
import { recorder } from "../../support/supabase-recorder.ts";

const feature = await loadFeature("tests/bdd/features/shared/insights-server.feature");

const READER = "https://reader.invalid";
const TIME = "https://time.invalid";
const NAMES = ["alice", "bob", "carol", "dan", "erin"];

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let educators: string[];
  let response: Response;
  let body: Record<string, unknown>;

  const firstLab = () => `/lab/${courseId}/topic-1/lab-1`;
  /** The course's tutors.json, as its site publishes it; any other URL is not on the network. */
  const courseSite = async (url: string | URL | Request) =>
    String(url) === courseJsonUrl(courseId) || String(url) === tutorsJsonUrl(courseId) ? Response.json({ enrollment: { educators } }) : new Response(null, { status: 404 });
  const event = (path: string, login: string | null, origin: string | null) => {
    const url = new URL(path, READER);
    const request = new Request(url, { headers: origin ? { origin } : {} });
    const actor = login ? { subject: `github:${login}`, login, name: login.toUpperCase(), email: null, image: null } : null;
    return { request, url, locals: { actor, locale: "en" }, fetch: courseSite } as never;
  };
  const insightsQueries = () => recorder.tableCalls.filter((c) => c.table === HELP_VIEW || c.table === ANNOTATIONS_VIEW);

  /** Tutors Time's desk, its fetch routed to the reader's handler as `login` from `origin`. */
  const reads = async (login: string, span: "day" | "week", day: string, origin: string) => {
    const desk = readerInsightsDesk(READER, async (input) => {
      const url = new URL(String(input));
      response = await getInsights(event(`${url.pathname}${url.search}`, login, origin));
      body = (await response.clone().json()) as Record<string, unknown>;
      return response;
    });
    return desk.course(courseId, span, day);
  };
  let answer: Awaited<ReturnType<typeof reads>>;

  const fiveAsked = (_ctx: unknown, stepId: string, day: string) => {
    for (const [i, learner] of NAMES.entries()) {
      const requestedAt = at(day, "09:00:00")!;
      seedRequest({ courseId, labRoute: firstLab(), stepId, learner, kind: i % 2 ? "hint" : "stuck", requestedAt, acknowledgedAt: plus(requestedAt, 60 * (i + 1)), closedAt: plus(requestedAt, 600), reason: i % 2 ? "hint" : "resolved" });
    }
  };
  const answers = (_ctx: unknown, status: number, reason: string) => {
    expect(response.status).toBe(status);
    expect(body.reason).toBe(reason);
  };
  const noQuery = () => expect(insightsQueries()).toEqual([]);

  Background(({ Given, And }) => {
    Given("the course {string} is published with {number} lab and {string} as its educator", (_ctx, id: string, _labs: number, educator: string) => {
      recorder.reset();
      courseId = id;
      educators = [educator];
    });
    And("the reader's server keeps help requests and feedback in Supabase with the service role key", () => {
      // $app/env/private carries PRIVATE_SUPABASE_SERVICE_ROLE_KEY for every scenario (the mock above).
    });
  });

  Rule(
    "If the insights views are missing in the database, then tutors shall show the insights pages empty with one message and keep the rest of Time working.",
    ({ RuleScenario }) => {
      RuleScenario("A database without the insights views", ({ Given, And, When, Then }) => {
        Given("5 students asked for help at the step {string} of the first lab on {string}", fiveAsked);
        And("the database has no insights views", () => {
          recorder.missingViews.add(HELP_VIEW);
          recorder.missingViews.add(ANNOTATIONS_VIEW);
        });
        When("{string} reads the insights of {string} for the day {string} from Tutors Time", async (_ctx, login: string, _course: string, day: string) => {
          answer = await reads(login, "day", day, TIME);
        });
        Then("the reader shall answer {number} with the reason {string}", answers);
        And("the insights page shall show the one message for {string}", (_ctx, reason: "not-ready") => {
          expect(answer).toEqual({ ok: false, reason });
          expect(en[REFUSAL_MESSAGES[reason]]).toMatch(/not set up/);
        });
        And("the reader shall still answer the course's help queue to {string}", async (_ctx, login: string) => {
          const queue = await getQueue(event(`/api/assistance?courseId=${courseId}`, login, null));
          expect(queue.status).toBe(200);
          expect(((await queue.json()) as { queue: unknown[] }).queue).toHaveLength(0);
        });
      });
    }
  );

  Rule("Tutors shall read insights with date-filtered, indexed queries bounded to the chosen period, as Rule 0319 requires of the calendar.", ({ RuleScenario }) => {
    RuleScenario("Every insights read names the course and the period, over an index that leads with them", ({ Given, And, When, Then }) => {
      Given("5 students asked for help at the step {string} of the first lab on {string}", fiveAsked);
      And("{string} has broadcast an explanation on the step {string} of the first lab on {string}", (_ctx, _author: string, stepId: string, day: string) => {
        seedAnnotation({ courseId, labRoute: firstLab(), stepId, learner: null, createdAt: at(day, "10:00:00")! });
      });
      When("{string} reads the insights of {string} for {number} days ending {string} from Tutors Time", async (_ctx, login: string, _course: string, _days: number, day: string) => {
        answer = await reads(login, "week", day, TIME);
      });
      Then("the reader shall answer {number} with the step {string} first", (_ctx, status: number, stepId: string) => {
        expect(response.status).toBe(status);
        expect(response.headers.get("access-control-allow-origin")).toBe(TIME);
        expect(response.headers.get("access-control-allow-credentials")).toBe("true");
        const insights = (answer.ok && answer.value) as CourseInsights;
        expect(insights.steps[0]).toMatchObject({ ref: { stepId }, total: 5, annotations: 1 });
      });
      And("every insights query shall filter on the course and on the period from {string} to {string}", (_ctx, from: string, to: string) => {
        const calls = insightsQueries();
        expect(calls.map((c) => c.table).sort()).toEqual([ANNOTATIONS_VIEW, HELP_VIEW]);
        for (const call of calls) {
          const time = call.table === HELP_VIEW ? "requested_at" : "created_at";
          expect(call.filters).toEqual([
            { column: "course_id", value: courseId, op: "eq" },
            { column: time, value: from, op: "gte" },
            { column: time, value: to, op: "lt" }
          ]);
        }
      });
      And("each view's table shall have an index on the course and the time it filters on", () => {
        const sql = readdirSync("supabase/migrations")
          .filter((f) => f.endsWith(".sql"))
          .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
          .join("\n")
          .replace(/\s+/g, " ");
        expect(sql).toContain("ON public.assistance_requests (course_id, requested_at)");
        expect(sql).toContain("ON public.feedback_annotations (course_id, created_at)");
        expect(sql).toMatch(/VIEW public\.insights_help_requests WITH \(security_invoker = true\) AS SELECT [^;]* FROM public\.assistance_requests;/);
        expect(sql).toMatch(/VIEW public\.insights_annotations WITH \(security_invoker = true\) AS SELECT [^;]* FROM public\.feedback_annotations;/);
      });
      And("no insights answer shall carry a hint, an annotation's body or a student's name", () => {
        expect(JSON.stringify(body)).not.toMatch(FREE_TEXT);
        for (const call of insightsQueries()) expect(call.columns).not.toMatch(/hint_text|learner_name|body/);
      });
    });

    RuleScenario("A student is refused before any row is read", ({ Given, When, Then, And }) => {
      Given("5 students asked for help at the step {string} of the first lab on {string}", fiveAsked);
      When("{string} reads the insights of {string} for the day {string} from Tutors Time", async (_ctx, login: string, _course: string, day: string) => {
        answer = await reads(login, "day", day, TIME);
      });
      Then("the reader shall answer {number} with the reason {string}", answers);
      And("no insights query shall have been made", noQuery);
    });

    RuleScenario("Another origin is refused", ({ Given, When, Then, And }) => {
      Given("5 students asked for help at the step {string} of the first lab on {string}", fiveAsked);
      When("{string} reads the insights of {string} for the day {string} from {string}", async (_ctx, login: string, _course: string, day: string, origin: string) => {
        answer = await reads(login, "day", day, origin);
        const pre = await preflight(event(`/api/insights?courseId=${courseId}`, null, origin));
        expect(pre.status).toBe(403);
      });
      Then("the reader shall answer {number} with the reason {string}", answers);
      And("no insights query shall have been made", noQuery);
    });
  });
});
