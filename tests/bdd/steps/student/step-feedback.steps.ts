import "../../support/svelte-runes-shim.ts";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { feedbackWorld, type FeedbackWorld } from "../../support/feedback.ts";
import { readerFeedbackDesk, type Annotation, type StepRef } from "../../../../packages/svelte/utils/feedback/src/index.ts";
import { createFeedbackService, explanationToast, EXPLANATION_TOAST, type FeedbackService } from "../../../../packages/svelte/utils/feedback/src/service.svelte.ts";
import type { StepFeedbackView } from "../../../../packages/svelte/utils/feedback/src/server/index.ts";
import { convertMdToHtml } from "../../../../packages/jsr/model/src/tutors.ts";
import { sanitizeHtml } from "../../../../packages/svelte/ui-primitives/src/utils/sanitize.ts";

const feature = await loadFeature("tests/bdd/features/student/step-feedback.feature");

const LAB = "/lab/cs101/lab-01";

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  let world: FeedbackWorld;
  let service: FeedbackService;
  /** Who the browser is signed in as. */
  let signedIn: string | null = null;
  let ref: StepRef;
  let received: Annotation[] | null;
  let toasts: ReturnType<typeof explanationToast>[];

  AfterEachScenario(() => {
    service.reset();
    vi.useRealTimers();
  });

  const step = (stepId: string): StepRef => ({ courseId: "cs101", labRoute: LAB, stepId });
  const post = async (author: string, at: StepRef, body: string, learnerId?: string) => {
    const answer = await world.api().post({ action: "annotate", ...at, body, ...(learnerId ? { learnerId } : { everyone: true }) }, { login: author });
    expect(answer.status).toBe(201);
  };
  const broadcast = (_ctx: unknown, author: string, body: string, stepId: string) => post(author, step(stepId), body);
  const written = (_ctx: unknown, author: string, body: string, learnerId: string, stepId: string) => post(author, step(stepId), body, learnerId);
  const opens = async (_ctx: unknown, login: string) => {
    signedIn = login;
    await service.arrive(ref, login);
  };
  const pass = async (_ctx: unknown, seconds: number) => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
  };
  const clock = (_ctx: unknown, at: string) => vi.setSystemTime(new Date(at));
  const nothingShown = () => {
    expect(service.banners()).toEqual([]);
    expect(service.view.value.personal).toEqual([]);
  };
  const readsReceived = async (_ctx: unknown, login: string, courseId: string) => {
    signedIn = login;
    service.available.value = true;
    await service.arrive(ref, login);
    received = await service.readReceived(courseId);
  };
  const historyFor = async (login: string): Promise<Annotation[] | null> => {
    const answer = await world.api().step({ ...ref }, { login });
    return (answer.body as StepFeedbackView).history;
  };
  const visitCourse = async (_ctx: unknown, login: string, courseId: string) => {
    signedIn = login;
    await service.visit(courseId, login, null, (a) => toasts.push(explanationToast(a)));
  };
  const oneToast = (_ctx: unknown, _login: string, stepId: string, url: string) => {
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe(stepId);
    expect(toasts[0].actionUrl).toBe(url);
    expect(toasts[0].description).toBe(EXPLANATION_TOAST);
  };

  Background(({ Given, And }) => {
    Given("{string} teaches the course {string}", (_ctx, educator: string, courseId: string) => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date("2026-01-05T08:00:00.000Z"));
      world = feedbackWorld();
      world.publish(courseId, [educator]);
      signedIn = null;
      received = null;
      toasts = [];
      service = createFeedbackService({ desk: readerFeedbackDesk((url, init) => world.serve(signedIn ? { login: signedIn } : null, String(url), init)), visible: () => true });
    });
    And("{string} is on the step {string} of the lab {string}", (_ctx, _login: string, stepId: string, labRoute: string) => {
      ref = { courseId: "cs101", labRoute, stepId };
    });
  });

  Rule(
    "When a student opens a lab step, the reader shall show every unrevoked broadcast for that step above the content and every annotation addressed to that student below it, from one query.",
    ({ RuleScenario }) => {
      RuleScenario("A broadcast and a personal annotation show where they belong", ({ Given, And, But, When, Then }) => {
        Given("{string} has broadcast {string} on the step {string}", broadcast);
        And("{string} has written {string} to {string} on the step {string}", written);
        But("{string} has written {string} to {string} on the step {string}", written);
        When("{string} opens the step", opens);
        Then("the reader shall show the banner {string} above the step", (_ctx, body: string) => expect(service.banners().map((a) => a.body)).toEqual([body]));
        And("the reader shall show the card {string} below the step", (_ctx, body: string) => expect(service.view.value.personal.map((a) => a.body)).toEqual([body]));
        And("the reader shall show no other annotation", () => expect(service.view.value.broadcasts.length + service.view.value.personal.length).toBe(2));
        And("the step's feedback shall have been read once", () => expect(world.reads().step).toBe(1));
      });

      RuleScenario("A visitor who is not signed in sees no feedback", ({ Given, When, Then }) => {
        Given("{string} has broadcast {string} on the step {string}", broadcast);
        When("a visitor who is not signed in opens the step", async () => {
          signedIn = null;
          await service.arrive(ref, null);
        });
        Then("the reader shall show no banner and no card", () => {
          nothingShown();
          expect(world.reads().step).toBe(0);
        });
      });
    }
  );

  Rule("While a student stays on a lab step, the reader shall refresh its annotations every 60 seconds without joining a realtime channel.", ({ RuleScenario }) => {
    RuleScenario("A broadcast posted while the student reads arrives within a minute", ({ Given, When, And, Then }) => {
      Given("{string} opens the step", opens);
      When("{string} broadcasts {string} on the step {string}", broadcast);
      And("{number} seconds pass", pass);
      Then("the reader shall show the banner {string} above the step", (_ctx, body: string) => expect(service.banners().map((a) => a.body)).toEqual([body]));
      And("the reader shall have joined no realtime channel for it", () => {
        // The service's only way out is its desk: both reads were HTTP requests to /api/feedback.
        expect(world.reads().step).toBe(2);
      });
    });

    RuleScenario("A student who left the step reads no more", ({ Given, And, When, Then }) => {
      Given("{string} opens the step", opens);
      And("{string} leaves the step", () => service.leave());
      When("{number} seconds pass", pass);
      Then("the step's feedback shall have been read once", () => expect(world.reads().step).toBe(1));
    });
  });

  Rule(
    "When an educator revokes an annotation, the reader shall stop showing it to students on their next refresh and keep it in the review history with the revocation time.",
    ({ RuleScenario }) => {
      RuleScenario("A revoked broadcast leaves the step and stays in the history", ({ Given, And, When, Then }) => {
        Given("{string} has broadcast {string} on the step {string}", broadcast);
        And("{string} opens the step", opens);
        And("the clock reads {string}", clock);
        When("{string} revokes the broadcast {string}", async (_ctx, educator: string, body: string) => {
          const target = world.store.all().find((a) => a.body === body)!;
          const answer = await world.api().post({ action: "revoke", id: target.id }, { login: educator });
          expect(answer.status).toBe(200);
        });
        And("{number} seconds pass", pass);
        Then("the reader shall show no banner and no card", nothingShown);
        And("the step's history for {string} shall list {string} revoked at {string}", async (_ctx, educator: string, body: string, at: string) => {
          const history = await historyFor(educator);
          expect(history?.find((a) => a.body === body)?.revokedAt).toBe(at);
        });
      });
    }
  );

  Rule("The reader shall render annotation bodies as markdown through the content renderer, sanitised as lab content is.", ({ RuleScenario }) => {
    let html = "";
    RuleScenario("Markdown is rendered and a script is removed", ({ Given, When, Then, And }) => {
      Given("{string} has broadcast {string} on the step {string}", broadcast);
      When("{string} opens the step", async (ctx, login: string) => {
        await opens(ctx, login);
        // As FeedbackBanner renders a banner's body.
        html = sanitizeHtml(convertMdToHtml(service.banners()[0].body));
      });
      Then("the banner shall render {string} in bold", (_ctx, word: string) => expect(html).toContain(`<strong>${word}</strong>`));
      And("the banner shall hold no script", () => expect(html).not.toMatch(/<script/i));
    });
  });

  Rule(
    "The reader shall show a student the history of annotations they received in a course, newest first, and show an educator what was broadcast on a step and when.",
    ({ RuleScenario }) => {
      RuleScenario("A student's history is newest first and leaves out another student's", ({ Given, And, But, When, Then }) => {
        Given("the clock reads {string}", clock);
        And("{string} has broadcast {string} on the step {string}", broadcast);
        And("the clock reads {string}", clock);
        And("{string} has written {string} to {string} on the step {string}", written);
        But("{string} has written {string} to {string} on the step {string}", written);
        When("{string} reads the feedback they received in {string}", readsReceived);
        Then("the history shall read {string}, then {string}", (_ctx, first: string, second: string) => {
          expect(received?.map((a) => a.body)).toEqual([first, second]);
          expect(service.received.value?.map((a) => a.body)).toEqual([first, second]);
        });
      });

      RuleScenario("The educator sees what was broadcast on the step and when", ({ Given, And, When, Then }) => {
        Given("the clock reads {string}", clock);
        And("{string} has broadcast {string} on the step {string}", broadcast);
        When("{string} opens the step", opens);
        Then("the step's history for {string} shall list {string} posted at {string}", (_ctx, _educator: string, body: string, at: string) => {
          expect(service.view.value.history?.find((a) => a.body === body)?.createdAt).toBe(at);
        });
      });

      RuleScenario("A student sees no step history", ({ When, Then }) => {
        When("{string} opens the step", opens);
        Then("the reader shall offer {string} no step history", () => expect(service.view.value.history).toBeNull());
      });
    }
  );

  Rule(
    "When an educator broadcasts an explanation on a lab step, the reader shall show the course's students on other pages of the course one toast naming the step and linking to it, without the explanation's text, and no more than one toast a minute.",
    ({ RuleScenario }) => {
      RuleScenario("A student elsewhere in the course is toasted on their next page", ({ Given, When, And, Then }) => {
        Given("{string} is reading the course page of {string}", visitCourse);
        When("{string} broadcasts {string} on the step {string}", broadcast);
        And("{number} seconds pass", pass);
        And("{string} moves to another page of {string}", visitCourse);
        Then("the reader shall show {string} one toast naming the step {string} and linking to {string}", oneToast);
        And("the toast shall not carry {string}", (_ctx, body: string) => expect(JSON.stringify(toasts)).not.toContain(body));
      });

      RuleScenario("A second explanation within the minute is not toasted again", ({ Given, And, When, Then }) => {
        Given("{string} is reading the course page of {string}", visitCourse);
        And("{string} broadcasts {string} on the step {string}", broadcast);
        And("{number} seconds pass", pass);
        And("{string} moves to another page of {string}", visitCourse);
        When("{string} broadcasts {string} on the step {string}", broadcast);
        And("{string} moves to a third page of {string}", visitCourse);
        Then("the reader shall show {string} one toast naming the step {string} and linking to {string}", oneToast);
      });

      RuleScenario("A student on the step itself reads the banner, not a toast", ({ Given, When, And, Then }) => {
        Given("{string} is reading the course page of {string}", visitCourse);
        When("{string} broadcasts {string} on the step {string}", broadcast);
        And("{number} seconds pass", pass);
        And("{string} moves to the step {string}", async (_ctx, login: string, stepId: string) => {
          await service.visit("cs101", login, step(stepId), (a) => toasts.push(explanationToast(a)));
        });
        Then("the reader shall show {string} no toast", () => expect(toasts).toEqual([]));
      });
    }
  );

  Rule("When someone else signs in on the same browser, the reader shall forget the feedback it read for the last person before reading any for them.", ({ RuleScenario }) => {
    RuleScenario("The next student sees none of the last student's feedback", ({ Given, And, When, Then }) => {
      Given("{string} has written {string} to {string} on the step {string}", written);
      And("{string} reads the feedback they received in {string}", readsReceived);
      When("{string} opens the step", async (ctx, login: string) => {
        expect(service.view.value.personal).toHaveLength(1);
        await opens(ctx, login);
      });
      Then("the reader shall show no banner and no card", nothingShown);
      And("the reader shall hold no received feedback until {string} reads it", () => expect(service.received.value).toBeNull());
    });
  });
});
