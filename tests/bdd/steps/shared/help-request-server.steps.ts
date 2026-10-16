import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the
// environments and the course's published tutors.json. Everything between them and the reader's
// route handlers is product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({
  createClient: (await import("../../support/supabase-recorder.ts")).createClient
}));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$app/env/public", async () => (await import("../../support/supabase-recorder.ts")).publicEnv);
vi.mock("$app/env/private", () => ({ PRIVATE_SUPABASE_SERVICE_ROLE_KEY: "service-role-key" }));

import type { HelpRequest, QueueEntry } from "../../../../packages/svelte/community/src/assistance/index.ts";
import { GET as getQueue, POST as postHelp } from "../../../../apps/reader/src/routes/api/assistance/+server.ts";
import { GET as getMine } from "../../../../apps/reader/src/routes/api/assistance/mine/+server.ts";
import { tutorsJsonUrl } from "../../../../apps/reader/src/lib/server/assistance.ts";
import { recorder } from "../../support/supabase-recorder.ts";

const feature = await loadFeature("tests/bdd/features/shared/help-request-server.feature");

const READER = "https://reader.invalid";
const TOPIC = (courseId: string) => `assistance:${courseId}`;

type Row = Record<string, unknown>;
type Notice = { courseId: string; id: string; state: string };

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let educators: string[];
  let signedIn: string | null;
  let response: Response;
  let answered: HelpRequest | null;
  const requests: Record<string, string> = {};

  const firstLab = () => `/lab/${courseId}/topic-1/lab-1`;
  /** The course's tutors.json, as its site publishes it; any other URL is not on the network. */
  const courseSite = async (url: string | URL | Request) =>
    String(url) === tutorsJsonUrl(courseId) ? Response.json({ enrollment: { educators } }) : new Response(null, { status: 404 });
  const event = (method: string, path: string, body?: unknown, origin?: string) => {
    const url = new URL(path, READER);
    const headers: Record<string, string> = body === undefined ? {} : { "content-type": "application/json" };
    if (origin) headers.origin = origin;
    const request = new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const actor = signedIn ? { subject: `github:${signedIn}`, login: signedIn, name: signedIn.toUpperCase(), email: null, image: null } : null;
    return { request, url, locals: { actor, locale: "en" }, fetch: courseSite } as never;
  };
  const post = async (body: unknown, origin?: string) => {
    response = await postHelp(event("POST", "/api/assistance", body, origin));
  };
  const rows = (): Row[] => recorder.rows("assistance_requests");
  const notices = (): Notice[] => recorder.sentOn(TOPIC(courseId)).map((m) => m.payload as Notice);
  const answers = (_ctx: unknown, status: number) => expect(response.status).toBe(status);

  const ask = (kind: string, stepId: string, origin?: string) => post({ action: "request", courseId, labRoute: firstLab(), stepId, kind }, origin);
  const browserAsks = async (_ctx: unknown, kind: string, stepId: string) => ask(kind, stepId);
  const as = (_ctx: unknown, name: string) => {
    signedIn = name;
  };
  const hasAsked = async (_ctx: unknown, name: string, kind: string, stepId: string) => {
    signedIn = name;
    await ask(kind, stepId);
    expect(response.status).toBe(201);
    requests[name] = ((await response.json()) as { request: HelpRequest }).request.id;
  };
  const acknowledgesAs = async (actor: string | null, owner: string) => {
    if (actor) signedIn = actor;
    await post({ action: "acknowledge", id: requests[owner] });
  };
  const holdsOne = (_ctx: unknown, state: string, name: string, stepId: string, kind: string) => {
    expect(rows()).toEqual([expect.objectContaining({ state, learner_id: name, step_id: stepId, lab_route: firstLab(), kind })]);
  };
  const watching = (_ctx: unknown, course: string) => {
    recorder.rows("realtime_watchers").push({ topic: TOPIC(course), watcher: "live-tab-1", seen_at: new Date().toISOString() });
  };
  const carriesNothing = () => expect(notices()).toEqual([]);

  Background(({ Given, And }) => {
    Given("the course {string} is published with {number} labs and {string} as its educator", (_ctx, id: string, _labs: number, educator: string) => {
      recorder.reset();
      courseId = id;
      educators = [educator];
      signedIn = null;
      answered = null;
      for (const key of Object.keys(requests)) delete requests[key];
    });
    And("the reader's server keeps help requests in Supabase with the service role key", () => {
      // $app/env/private carries PRIVATE_SUPABASE_SERVICE_ROLE_KEY for every scenario (the mock above).
    });
  });

  Rule(
    "Tutors shall accept a help request, acknowledgement or resolution only on the reader's server from the signed-in actor, refusing a visitor who is not signed in with 401 and a student acting as the lecturer with 403.",
    ({ RuleScenario }) => {
      RuleScenario("A signed-in student's request is kept as theirs", ({ Given, When, Then, And }) => {
        Given("{string} is signed in to the reader", as);
        When("the browser asks for help as {string} on the step {string} of the first lab", browserAsks);
        Then("the reader shall answer {number}", answers);
        And("Supabase shall hold one {string} help request by {string} at the step {string} of the first lab of kind {string}", holdsOne);
      });

      RuleScenario("A visitor who is not signed in is refused", ({ Given, When, Then, And }) => {
        Given("nobody is signed in to the reader", () => {
          signedIn = null;
        });
        When("the browser asks for help as {string} on the step {string} of the first lab", browserAsks);
        Then("the reader shall answer {number}", answers);
        And("Supabase shall hold no help request", () => expect(rows()).toEqual([]));
      });

      RuleScenario("A student cannot acknowledge as the lecturer", ({ Given, When, Then, And }) => {
        Given("{string} has asked for help as {string} on the step {string} of the first lab", hasAsked);
        And("{string} is signed in to the reader", as);
        When("the browser acknowledges the request of {string}", (_ctx, owner: string) => acknowledgesAs(null, owner));
        Then("the reader shall answer {number}", answers);
        And("Supabase shall hold one {string} help request by {string} at the step {string} of the first lab of kind {string}", holdsOne);
      });

      RuleScenario("The course's educator acknowledges", ({ Given, When, Then, And }) => {
        Given("{string} has asked for help as {string} on the step {string} of the first lab", hasAsked);
        And("{string} is signed in to the reader", as);
        When("the browser acknowledges the request of {string}", (_ctx, owner: string) => acknowledgesAs(null, owner));
        Then("the reader shall answer {number}", answers);
        And("Supabase shall hold one {string} help request by {string} at the step {string} of the first lab of kind {string}", holdsOne);
        And("the request shall record it was acknowledged by {string}", (_ctx, name: string) => expect(rows()[0].acknowledged_by).toBe(name));
      });

      RuleScenario("Another site cannot ask for help with the student's session", ({ Given, When, Then, And }) => {
        Given("{string} is signed in to the reader", as);
        When("a page on another origin asks for help as {string} on the step {string} of the first lab", (_ctx, kind: string, stepId: string) =>
          ask(kind, stepId, "https://elsewhere.invalid")
        );
        Then("the reader shall answer {number}", answers);
        And("Supabase shall hold no help request", () => expect(rows()).toEqual([]));
      });
    }
  );

  Rule("When a help request changes state, tutors shall publish the changed request's id and state on the course's help queue topic once it is stored.", ({ RuleScenario }) => {
    RuleScenario("An educator watching the queue hears a request open and be acknowledged", ({ Given, And, When, Then }) => {
      Given("a Tutors Live tab is watching the help queue of {string}", watching);
      And("{string} has asked for help as {string} on the step {string} of the first lab", hasAsked);
      When("{string} acknowledges the request of {string}", (_ctx, actor: string, owner: string) => acknowledgesAs(actor, owner));
      Then("the help queue topic shall carry the request of {string} as {string}, then as {string}", (_ctx, name: string, first: string, second: string) => {
        expect(response.status).toBe(200);
        expect(notices()).toEqual([
          { courseId, id: requests[name], state: first },
          { courseId, id: requests[name], state: second }
        ]);
      });
      And("no notice shall name the student, the step or the kind", () => {
        for (const notice of notices()) expect(Object.keys(notice).sort()).toEqual(["courseId", "id", "state"]);
      });
    });

    RuleScenario("A refused change publishes nothing", ({ Given, And, When, Then }) => {
      Given("a Tutors Live tab is watching the help queue of {string}", watching);
      And("{string} has asked for help as {string} on the step {string} of the first lab", hasAsked);
      When("{string} acknowledges the request of {string}", (_ctx, actor: string, owner: string) => acknowledgesAs(actor, owner));
      Then("the help queue topic shall carry the request of {string} as {string} and nothing more", (_ctx, name: string, state: string) => {
        expect(response.status).toBe(403);
        expect(notices()).toEqual([{ courseId, id: requests[name], state }]);
      });
    });

    RuleScenario("Nobody is watching, so nothing is published or charged", ({ Given, Then, And }) => {
      Given("{string} has asked for help as {string} on the step {string} of the first lab", hasAsked);
      Then("the help queue topic shall carry nothing", carriesNothing);
      And("Live's budget shall have spent nothing", () => expect(recorder.liveSpent()).toBe(0));
    });
  });

  Rule(
    "Tutors shall give a course's help queue only to a signed-in educator of the course, and give a student only their own live request, read from stored rows.",
    ({ RuleScenario }) => {
      const readsQueue = async (_ctx: unknown, id: string) => {
        response = await getQueue(event("GET", `/api/assistance?courseId=${id}`));
      };
      const readsOwn = async (_ctx: unknown, name: string, id: string) => {
        signedIn = name;
        response = await getMine(event("GET", `/api/assistance/mine?courseId=${id}`));
        expect(response.status).toBe(200);
        answered = ((await response.json()) as { request: HelpRequest | null }).request;
      };

      RuleScenario("The educator reads the queue", ({ Given, And, When, Then }) => {
        Given("{string} has asked for help as {string} on the step {string} of the first lab", hasAsked);
        And("{string} is signed in to the reader", as);
        When("the browser reads the help queue of {string}", readsQueue);
        Then("the queue shall hold the request of {string} at the step {string} of the first lab", async (_ctx, name: string, stepId: string) => {
          expect(response.status).toBe(200);
          const { queue } = (await response.json()) as { queue: QueueEntry[] };
          expect(queue.map((e) => [e.request.learnerId, e.request.ref.labRoute, e.request.ref.stepId, e.escalation])).toEqual([[name, firstLab(), stepId, "none"]]);
          expect(queue[0].waitingMs).toBeGreaterThanOrEqual(0);
        });
      });

      RuleScenario("A student cannot read the queue", ({ Given, When, Then }) => {
        Given("{string} is signed in to the reader", as);
        When("the browser reads the help queue of {string}", readsQueue);
        Then("the reader shall answer {number}", answers);
      });

      RuleScenario("A student reads their own request", ({ Given, When, Then }) => {
        Given("{string} has asked for help as {string} on the step {string} of the first lab", hasAsked);
        When("{string} reads their own help request in {string}", readsOwn);
        Then("the answer shall be the request of {string} of kind {string}", (_ctx, name: string, kind: string) => {
          expect(answered).toMatchObject({ id: requests[name], learnerId: name, kind, state: "open" });
        });
      });

      RuleScenario("A student never reads another student's request", ({ Given, When, Then }) => {
        Given("{string} has asked for help as {string} on the step {string} of the first lab", hasAsked);
        When("{string} reads their own help request in {string}", readsOwn);
        Then("the answer shall be no request", () => expect(answered).toBeNull());
      });
    }
  );

  Rule(
    "If the assistance store is unreachable when a student asks for help, then tutors shall answer that the request was not sent, and record and publish nothing.",
    ({ RuleScenario }) => {
      RuleScenario("The database is down", ({ Given, And, When, Then }) => {
        Given("a Tutors Live tab is watching the help queue of {string}", watching);
        And("the help request table is unreachable", () => {
          recorder.tableErrors.set("assistance_requests", { message: "connect ECONNREFUSED" });
        });
        And("{string} is signed in to the reader", as);
        When("the browser asks for help as {string} on the step {string} of the first lab", browserAsks);
        Then("the reader shall answer {number} saying the help request was not sent", async (_ctx, status: number) => {
          expect(response.status).toBe(status);
          expect(((await response.json()) as { message: string }).message).toMatch(/not sent/);
          expect(rows()).toEqual([]);
        });
        And("the help queue topic shall carry nothing", carriesNothing);
      });
    }
  );
});
