import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// Only the databases and the published course fetch are replaced; the route, the educator check and the lock store are product code.
const service = vi.hoisted(() => ({ configured: true }));
vi.mock("../../../../apps/reader/src/lib/server/supabase-service.ts", async () => {
  const { recorder } = await import("../../support/supabase-recorder.ts");
  return { serviceSupabase: () => (service.configured ? recorder : null) };
});
vi.mock("@tutors/community/utils/supabase-client", async () => ({ supabase: (await import("../../support/supabase-recorder.ts")).recorder }));
// Educator Control's lock state lives in Svelte runes; plain boxes stand in for them outside a component.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(initial: T) => ({ value: initial });
  return { rune, contentLocks: rune(new Map()), isEducator: rune(true), locksLoaded: rune(false), tutorsId: rune(null), currentCourse: rune(null) };
});
// The toast is the one thing outside product code: the steps read what the reader asked it to show.
vi.mock("../../../../packages/svelte/ui-primitives/src/utils/toaster.ts", () => ({ toaster: { error: vi.fn() } }));

import { PUT } from "../../../../apps/reader/src/routes/api/courses/[courseid]/locks/+server.ts";
import { upsertLock } from "../../../../packages/svelte/utils/rbac/src/lock-store.ts";
import { rbacService, SHOW_LOCKED_KEY } from "../../../../packages/svelte/utils/rbac/src/rbac-service.svelte.ts";
import { reportLockChange } from "../../../../packages/svelte/ui-navigators/src/buttons/lock-change.ts";
import { toaster } from "../../../../packages/svelte/ui-primitives/src/utils/toaster.ts";
import { contentLocks } from "../../../../packages/svelte/runes/src/index.svelte.ts";
import { browserStorage, recorder } from "../../support/supabase-recorder.ts";
import type { Lo } from "@tutors/tutors-model-lib";

const feature = await loadFeature("tests/bdd/features/instructor/content-lock-changes.feature");

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let fetchCourse: ReturnType<typeof vi.fn>;
  let response: Response | undefined;
  let failed: { status: number } | undefined;

  const change = async (login: string, loRoute: string, locked: boolean) => {
    response = undefined;
    failed = undefined;
    try {
      response = await PUT({
        params: { courseid: courseId },
        locals: { actor: login === "anonymous" ? null : { login } },
        fetch: fetchCourse,
        // A forged lockedBy in the body must not reach the table.
        request: new Request("http://reader.test/", { method: "PUT", body: JSON.stringify({ loRoute, locked, lockedBy: "forged" }) })
      } as never);
    } catch (cause) {
      failed = cause as { status: number };
    }
  };
  const saved = (loRoute: string) => recorder.rows("tutors_content_locks").find((row) => row.lo_route === loRoute);
  const noWrites = () => expect(recorder.upserts("tutors_content_locks")).toEqual([]);

  // Educator Control in a browser: its lock requests reach the real PUT handler above, signed in as the
  // course's educator, unless a scenario has the server refuse, fail, wait or be unreachable.
  let answer = "saved";
  let lockRequests = 0;
  let releaseWaiting: (() => void) | undefined;
  let waitingChange: Promise<unknown> | undefined;
  const states: Record<string, boolean | undefined> = { locked: true, unlocked: false, "no lock": undefined };
  const browserFetch = async (url: string, init: { method?: string; body?: string }): Promise<Response> => {
    lockRequests++;
    if (answer === "unreachable") throw new TypeError("Failed to fetch");
    if (answer === "slow") await new Promise<void>((resolve) => (releaseWaiting = resolve));
    try {
      return await PUT({
        params: { courseid: courseId },
        locals: { actor: { login: answer === "refused" ? "student" : "lecturer" } },
        fetch: fetchCourse,
        request: new Request(`http://reader.test${url}`, init)
      } as never);
    } catch (cause) {
      return new Response(null, { status: (cause as { status: number }).status });
    }
  };
  const openEducatorControl = (loRoute: string, state: string) => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", browserStorage());
    vi.stubGlobal("fetch", browserFetch);
    rbacService.clear();
    rbacService.loadRole("lecturer", courseId, { enrollment: { educators: ["lecturer"] } });
    const locked = states[state];
    contentLocks.value = locked === undefined ? new Map() : new Map([[loRoute, locked]]);
  };
  const serverAnswers = (_ctx: unknown, how: string) => {
    if (how === "failed") recorder.tableErrors.set("tutors_content_locks", { message: "offline" });
    if (how === "no database") service.configured = false;
    answer = how;
  };
  const setLock = (_ctx: unknown, loRoute: string, state: string) => reportLockChange(rbacService.toggleContentLock(loRoute, states[state] === true));
  const showsLock = (_ctx: unknown, loRoute: string, state: string) => expect(contentLocks.value.get(loRoute)).toBe(states[state]);
  const storesLock = (_ctx: unknown, loRoute: string, state: string) => {
    const stored = JSON.parse(localStorage.getItem(`tutors-locks-${courseId}`) ?? "{}") as Record<string, boolean>;
    expect(stored[loRoute]).toBe(states[state]);
  };
  const toldNotSaved = (_ctx: unknown, title: string) => {
    expect(toaster.error).toHaveBeenCalledTimes(1);
    expect(toaster.error).toHaveBeenCalledWith(expect.objectContaining({ title }));
  };

  Background(({ Given }) => {
    Given("{string} publishes an enrollment with {string} as educator", (_ctx, id: string, educator: string) => {
      recorder.reset();
      vi.unstubAllGlobals();
      vi.mocked(toaster.error).mockClear();
      answer = "saved";
      lockRequests = 0;
      service.configured = true;
      courseId = id;
      fetchCourse = vi.fn(async () => Response.json({ enrollment: { educators: [educator], whitelist: [], students: [] } }));
    });
  });

  Rule(
    "When a course educator locks or unlocks a resource, the data API shall save the lock with the educator's own GitHub login as the person who changed it.",
    ({ RuleScenario }) => {
      RuleScenario("Locking and unlocking a topic saves who changed it", ({ When, Then, And }) => {
        When("{string} locks {string}", (_ctx, login: string, loRoute: string) => change(login, loRoute, true));
        Then("the lock change shall succeed", () => {
          expect(failed).toBeUndefined();
          expect(response!.status).toBe(200);
          expect(response!.headers.get("cache-control")).toBe("private, no-store");
        });
        And("{string} shall be saved as locked by {string}", (_ctx, loRoute: string, login: string) => {
          expect(saved(loRoute)).toMatchObject({ course_id: "pf1", lo_route: loRoute, locked: true, locked_by: login });
        });
        When("{string} unlocks {string}", (_ctx, login: string, loRoute: string) => change(login, loRoute, false));
        Then("{string} shall be saved as unlocked by {string}", (_ctx, loRoute: string, login: string) => {
          expect(failed).toBeUndefined();
          expect(recorder.rows("tutors_content_locks")).toHaveLength(1);
          expect(saved(loRoute)).toMatchObject({ locked: false, locked_by: login });
        });
      });

      RuleScenario("Educator Control sends the change to the server, not the database", ({ When, Then, And }) => {
        let browserFetch: ReturnType<typeof vi.fn>;
        When("Educator Control locks {string}", async (_ctx, loRoute: string) => {
          browserFetch = vi.fn(async () => Response.json({ ok: true }));
          vi.stubGlobal("fetch", browserFetch);
          try {
            expect(await upsertLock("pf1", loRoute, true)).toBe("saved");
          } finally {
            vi.unstubAllGlobals();
          }
        });
        Then("the browser shall have asked the server to lock {string}", (_ctx, loRoute: string) => {
          expect(browserFetch).toHaveBeenCalledWith("/api/courses/pf1/locks", expect.objectContaining({ method: "PUT" }));
          expect(JSON.parse(browserFetch.mock.calls[0][1].body)).toEqual({ loRoute, locked: true });
        });
        And("the browser shall not have written to the database", () => {
          expect(recorder.tableCalls).toEqual([]);
        });
      });
    }
  );

  Rule("If the requester is not a verified educator of the published course, then the data API shall refuse the lock change without writing to the database.", ({ RuleScenario, RuleScenarioOutline }) => {
    RuleScenarioOutline("A student or visitor cannot change a lock", ({ When, Then, And }, variables) => {
      When("{string} locks {string}", (_ctx, _login: string, loRoute: string) => change(variables.login, loRoute, true));
      Then("the lock change shall fail with status <status>", () => {
        expect(failed).toMatchObject({ status: Number(variables.status) });
      });
      And("no lock shall have been written", noWrites);
    });

    RuleScenario("A course id outside the Netlify forms is refused before any fetch", ({ Given, When, Then, And }) => {
      Given("the lock change targets {string}", (_ctx, id: string) => {
        courseId = id;
      });
      When("{string} locks {string}", (_ctx, login: string, loRoute: string) => change(login, loRoute, true));
      Then("the lock change shall fail with status {number}", (_ctx, status: number) => {
        expect(failed).toMatchObject({ status });
        expect(fetchCourse).not.toHaveBeenCalled();
      });
      And("no lock shall have been written", noWrites);
    });
  });

  Rule("If the server has no database service key or the write fails, then the data API shall refuse the lock change and report it as not saved.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("The server cannot save the lock", ({ Given, When, Then }, variables) => {
      Given("the {string} is unavailable", () => {
        if (variables.dependency === "service key") service.configured = false;
        if (variables.dependency === "database") recorder.tableErrors.set("tutors_content_locks", { message: "offline" });
      });
      When("{string} locks {string}", (_ctx, login: string, loRoute: string) => change(login, loRoute, true));
      Then("the lock change shall fail with status <status>", () => {
        expect(failed).toMatchObject({ status: Number(variables.status) });
      });
    });
  });

  Rule(
    "If the server does not save a content lock change, then the reader shall tell the educator that the change is not saved for students.",
    ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenarioOutline("A lock change the server does not save is put back", ({ Given, When, Then, And }, variables) => {
        Given('Educator Control shows {string} as "<before>"', (_ctx, loRoute: string) => openEducatorControl(loRoute, variables.before));
        And('the server answers lock changes with "<answer>"', (ctx) => serverAnswers(ctx, variables.answer));
        When('the educator sets {string} to "<after>"', (ctx, loRoute: string) => setLock(ctx, loRoute, variables.after));
        Then('Educator Control shall show {string} as "<before>"', (ctx, loRoute: string) => showsLock(ctx, loRoute, variables.before));
        And('this browser shall store {string} as "<before>"', (ctx, loRoute: string) => storesLock(ctx, loRoute, variables.before));
        And("the educator shall be told {string}", toldNotSaved);
      });

      RuleScenario("Show locked content to students is put back when it is not saved", ({ Given, When, Then, And }) => {
        Given("Educator Control shows {string} as {string}", (_ctx, loRoute: string, state: string) => openEducatorControl(loRoute, state));
        And("the server answers lock changes with {string}", serverAnswers);
        When("the educator turns on {string}", () => reportLockChange(rbacService.setShowLockedToStudents(true)));
        Then("{string} shall be off", () => {
          expect(rbacService.showLockedToStudents()).toBe(false);
          expect(contentLocks.value.get(SHOW_LOCKED_KEY)).toBe(false);
        });
        And("the educator shall be told {string}", toldNotSaved);
      });

      RuleScenario("Unlocking a card that the server does not save keeps the card locked", ({ Given, When, Then, And }) => {
        Given("Educator Control shows {string} as {string}", (_ctx, loRoute: string, state: string) => openEducatorControl(loRoute, state));
        And("the server answers lock changes with {string}", serverAnswers);
        // What the card's Unlock button runs (Cards.svelte).
        When("the educator selects Unlock on the card for {string}", (_ctx, loRoute: string) => reportLockChange(rbacService.toggleContentLock(loRoute, false)));
        Then("the card for {string} shall still be locked", (_ctx, route: string) => {
          expect(rbacService.isLoLocked({ type: "topic", route } as Lo)).toBe(true);
        });
        And("the educator shall be told {string}", toldNotSaved);
      });

      RuleScenario("A reader without a lock database keeps the change in this browser only", ({ Given, When, Then, And }) => {
        Given("Educator Control shows {string} as {string}", (_ctx, loRoute: string, state: string) => openEducatorControl(loRoute, state));
        And("the server answers lock changes with {string}", serverAnswers);
        When("the educator sets {string} to {string}", setLock);
        Then("Educator Control shall show {string} as {string}", showsLock);
        And("this browser shall store {string} as {string}", storesLock);
        And("Educator Control shall say lock changes are saved in this browser only", () => {
          expect(rbacService.locksSavedLocally).toBe(true);
          expect(toaster.error).not.toHaveBeenCalled();
        });
      });
    }
  );

  Rule("While a content lock change is waiting for the server, the reader shall refuse another change to that lock.", ({ RuleScenario }) => {
    RuleScenario("A second change waits for the first to be saved", ({ Given, When, Then, And }) => {
      Given("Educator Control shows {string} as {string}", (_ctx, loRoute: string, state: string) => openEducatorControl(loRoute, state));
      And("the server is slow to answer lock changes", () => {
        answer = "slow";
      });
      When("the educator sets {string} to {string}", (ctx, loRoute: string, state: string) => {
        waitingChange = setLock(ctx, loRoute, state);
      });
      And("the educator sets {string} to {string} before the server answers", async (ctx, loRoute: string, state: string) => {
        await setLock(ctx, loRoute, state);
      });
      Then("the switch for {string} shall be busy", (_ctx, loRoute: string) => expect(rbacService.isLockPending(loRoute)).toBe(true));
      And("the browser shall have sent {number} lock change", (_ctx, count: number) => expect(lockRequests).toBe(count));
      When("the server answers the waiting lock change", async () => {
        await vi.waitFor(() => expect(releaseWaiting).toBeDefined());
        releaseWaiting!();
        await waitingChange;
      });
      Then("Educator Control shall show {string} as {string}", showsLock);
      And("the switch for {string} shall not be busy", (_ctx, loRoute: string) => expect(rbacService.isLockPending(loRoute)).toBe(false));
    });

    RuleScenario("A change after the first is saved goes through", ({ Given, When, Then, And }) => {
      Given("Educator Control shows {string} as {string}", (_ctx, loRoute: string, state: string) => openEducatorControl(loRoute, state));
      When("the educator sets {string} to {string}", setLock);
      And("the educator sets {string} to {string}", setLock);
      Then("Educator Control shall show {string} as {string}", showsLock);
      And("this browser shall store {string} as {string}", storesLock);
      And("the browser shall have sent {number} lock changes", (_ctx, count: number) => {
        expect(lockRequests).toBe(count);
        expect(saved("/topic/pf1/topic-01")).toMatchObject({ locked: false, locked_by: "lecturer" });
      });
      And("no lock change notice shall be shown", () => {
        expect(toaster.error).not.toHaveBeenCalled();
        expect(rbacService.locksSavedLocally).toBe(false);
      });
    });
  });
});
