import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { z } from "zod";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env
// and SvelteKit. Everything between them is product code, the reader's server route included.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({
  createClient: (await import("../../support/supabase-recorder.ts")).createClient
}));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$app/env/public", async () => (await import("../../support/supabase-recorder.ts")).publicEnv);
vi.mock("$app/env", () => ({ browser: true, goto: vi.fn() }));

import { ALL_COURSES_CHANNEL, freshBrowser, githubUser, labsOf, liveWatcher, openLo, postToReaderServer, publishedCourse, readerServer, signIn } from "../../support/connect.ts";
import { recorder, settle } from "../../support/supabase-recorder.ts";
import { mountWhiteboardEditor } from "../../support/whiteboard-editor.ts";
import {
  MESSAGE_CONTRACTS,
  negativeDir,
  readJson,
  recordedPath,
  shapeOf,
  undeclaredPaths,
  versionFindings,
  versionPath,
  type MessageContract
} from "../../../contract/messages/contracts.ts";
import { liveService } from "../../../../packages/svelte/community/src/services/live.svelte.ts";
import { presenceService } from "../../../../packages/svelte/community/src/services/presence.svelte.ts";

const feature = await loadFeature("tests/bdd/features/developer/message-contracts.feature");

/** `UPDATE_MESSAGE_CONTRACTS=1` rewrites the recordings and the current version files from what the producers sent. */
const UPDATE = process.env.UPDATE_MESSAGE_CONTRACTS === "1";

const contract = (name: string): MessageContract => MESSAGE_CONTRACTS.find((c) => c.name === name)!;
const readIfThere = (path: string) => (existsSync(path) ? readJson(path) : undefined);

/** Every field path in a payload, arrays collapsed to `[]`: what a recording and a fresh capture must share. */
function fieldPaths(value: unknown, at = ""): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap((item) => fieldPaths(item, `${at}[]`)))];
  if (!value || typeof value !== "object") return [at];
  return Object.entries(value).flatMap(([key, field]) => fieldPaths(field, at ? `${at}.${key}` : key));
}

/** The producer's payload holds to the current version, and has the fields of that version's recording. */
function holdsToContract(name: string, payload: unknown) {
  const { schema, version } = contract(name);
  const parsed = schema.safeParse(payload);
  expect(parsed.success, `${name}: ${parsed.error?.message}`).toBe(true);
  expect(undeclaredPaths(payload, shapeOf(schema)), `${name} sends fields its contract does not declare`).toEqual([]);
  if (UPDATE) {
    writeFileSync(recordedPath(name, version), JSON.stringify(payload, null, 2) + "\n");
    writeFileSync(versionPath(name, version), JSON.stringify(shapeOf(schema), null, 2) + "\n");
  }
  const recorded = readIfThere(recordedPath(name, version));
  expect(recorded, `no recording for ${name} v${version}; run with UPDATE_MESSAGE_CONTRACTS=1`).toBeDefined();
  expect(fieldPaths(payload).sort(), `${name}: the producer's fields differ from recorded/${name}.v${version}.json`).toEqual(fieldPaths(recorded).sort());
}

const accepted = (name: string) => contract(name).accepts.map((version) => readJson(recordedPath(name, version)) as Record<string, unknown>);

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  let course: ReturnType<typeof publishedCourse>;
  let whiteboard: ReturnType<typeof mountWhiteboardEditor> | undefined;
  let api: { getSceneElements: ReturnType<typeof vi.fn>; updateScene: ReturnType<typeof vi.fn> };

  const editorInARoom = () => {
    vi.useFakeTimers();
    whiteboard = mountWhiteboardEditor();
    api = { getSceneElements: vi.fn().mockReturnValue([]), updateScene: vi.fn() };
    whiteboard.editor.excalidrawAPI(api);
    whiteboard.status("SUBSCRIBED");
    whiteboard.participants(2);
  };

  AfterEachScenario(() => {
    whiteboard?.unmount();
    whiteboard = undefined;
    liveService.stopGlobalPresenceService();
    presenceService.stopPresenceListener();
    vi.useRealTimers();
  });

  Rule("Tutors shall send every realtime message in the shape of the current version of its contract, with no field the contract does not declare.", ({ RuleScenario }) => {
    RuleScenario("The reader's learning event matches the lo-event contract", ({ Given, When, Then, And }) => {
      Given("a live dashboard is watching the course feed", () => {
        freshBrowser();
        course = publishedCourse("contract-course", 1);
        liveWatcher(course.courseId, "live-tab-1");
      });
      When("a signed-in student who shares presence opens a lab", async () => {
        await signIn(githubUser("Ann"));
        await openLo(course, labsOf(course)[0]);
        await settle();
      });
      Then("the learning event the reader posts and the one its server broadcasts match the lo-event contract", () => {
        expect(readerServer.posts).toHaveLength(1);
        const broadcast = recorder.sentOn(course.courseId);
        expect(broadcast.map((m) => m.event)).toEqual(["lo-event"]);
        expect(broadcast[0].payload, "the server broadcasts what the reader sent").toEqual(readerServer.posts[0].body);
      });
      And("they have the fields of the recorded lo-event", () => {
        holdsToContract("lo-event", readerServer.posts[0].body);
      });
    });

    RuleScenario("The whiteboard editor's broadcasts and presence match their contracts", ({ Given, When, Then, And }) => {
      const sent = (event: string) => whiteboard!.channel.send.mock.calls.filter(([m]) => m.event === event).map(([m]) => m.payload);
      Given("a whiteboard editor has joined a room with another person in it", editorInARoom);
      When("the person draws a shape and moves the pointer", () => {
        whiteboard!.editor.onChange([{ id: "shape-1", version: 1, type: "rectangle", x: 10, y: 20, width: 100, height: 50 }]);
        vi.advanceTimersByTime(250);
        whiteboard!.editor.onPointerUpdate({ pointer: { x: 40, y: 50 }, button: "down" });
        vi.advanceTimersByTime(100);
      });
      Then("the scene-update, cursor-update and presence the editor sends match their contracts", () => {
        expect(sent("scene-update")).toHaveLength(1);
        expect(sent("cursor-update")).toHaveLength(1);
        expect(whiteboard!.channel.track).toHaveBeenCalledTimes(1);
      });
      And("they have the fields of their recordings", () => {
        holdsToContract("scene-update", sent("scene-update")[0]);
        holdsToContract("cursor-update", sent("cursor-update")[0]);
        holdsToContract("presence", whiteboard!.channel.track.mock.calls[0]![0]);
      });
    });
  });

  Rule(
    "If the shape of a realtime message differs from the committed shape of its current version, then tutors shall fail the build until the message has a new version with its own shape and recording.",
    ({ RuleScenario }) => {
      RuleScenario("A changed shape with an unchanged version fails", ({ Given, When, Then }) => {
        let changed: MessageContract;
        let findings: string[] = [];
        Given("the lo-event contract with a field added and its version unchanged", () => {
          const loEvent = contract("lo-event");
          changed = { ...loEvent, schema: loEvent.schema.extend({ room: z.string() }) };
        });
        When("its versions are checked", () => {
          findings = versionFindings(changed, readIfThere);
        });
        Then("the finding says {string}", (_ctx, finding: string) => {
          expect(findings).toEqual([`lo-event: ${finding}`]);
        });
      });

      RuleScenario("Every message contract matches its committed version", ({ Given, When, Then }) => {
        let findings: string[] = [];
        Given("the committed message contracts", () => {
          expect(MESSAGE_CONTRACTS.map((c) => c.name)).toEqual(["lo-event", "scene-update", "cursor-update", "presence"]);
        });
        When("their versions are checked", () => {
          findings = MESSAGE_CONTRACTS.flatMap((c) => versionFindings(c, readIfThere));
        });
        Then("there are no findings", () => {
          expect(findings).toEqual([]);
        });
      });
    }
  );

  Rule(
    "Tutors shall read, in every consumer, the recorded payload of each version a message contract still accepts, and refuse each negative lo-event fixture at the reader's server with 400.",
    ({ RuleScenario }) => {
      RuleScenario("The reader's server and Tutors Live read every accepted lo-event recording", ({ Given, When, Then, And }) => {
        const answers: number[] = [];
        Given("Tutors Live is showing the platform feed", async () => {
          freshBrowser();
          await liveService.startGlobalPresenceService();
          await settle();
        });
        When("each accepted lo-event recording arrives at the reader's server and over Realtime", async () => {
          for (const payload of accepted("lo-event")) {
            answers.push((await postToReaderServer(JSON.stringify(payload))).status);
            recorder.relay(ALL_COURSES_CHANNEL, { type: "broadcast", event: "lo-event", payload });
          }
          await settle();
        });
        Then("the reader's server accepts it with 202", () => {
          expect(answers).toEqual(accepted("lo-event").map(() => 202));
        });
        And("Tutors Live lists the student it names", () => {
          const names = accepted("lo-event").map((p) => (p.user as { fullName: string }).fullName);
          expect(liveService.studentsOnline.value.map((lo) => lo.user?.fullName)).toEqual(expect.arrayContaining(names));
        });
      });

      RuleScenario("The whiteboard editor applies every accepted scene-update and cursor-update recording", ({ Given, When, Then, And }) => {
        Given("a whiteboard editor has joined a room with another person in it", editorInARoom);
        When("each accepted scene-update and cursor-update recording arrives from the other person", () => {
          for (const payload of accepted("scene-update")) whiteboard!.receive("scene-update", payload);
          for (const payload of accepted("cursor-update")) whiteboard!.receive("cursor-update", payload);
        });
        Then("the editor's scene holds the recorded elements", () => {
          const ids = accepted("scene-update").flatMap((p) => (p.elements as { id: string }[]).map((e) => e.id));
          const shown = api.updateScene.mock.calls.flatMap(([scene]) => (scene as { elements: { id: string }[] }).elements.map((e) => e.id));
          expect(shown).toEqual(expect.arrayContaining(ids));
        });
        And("the editor shows the recorded collaborator's pointer", () => {
          for (const payload of accepted("cursor-update")) {
            const shown = whiteboard!.stateSetters
              .flatMap((set) => set.mock.calls.map(([value]) => value))
              // The editor runs in its own realm (node:vm), so its Map is not this realm's Map.
              .filter((value) => Object.prototype.toString.call(value) === "[object Map]");
            const collaborator = shown.map((collabs) => (collabs as Map<string, { pointer: unknown }>).get(payload.userId as string)).find(Boolean);
            expect(collaborator?.pointer, `cursor of ${payload.userId}`).toEqual(payload.pointer);
          }
        });
      });

      RuleScenario("Each negative fixture is refused", ({ Given, Then, And }) => {
        let fixtures: { file: string; name: string; payload: unknown }[] = [];
        Given("the negative message fixtures", () => {
          fixtures = readdirSync(negativeDir)
            .filter((file) => file.endsWith(".json"))
            .map((file) => ({ file, name: file.split(".")[0], payload: readJson(resolve(negativeDir, file)) }));
          // Every contract has at least one payload it must refuse.
          expect([...new Set(fixtures.map((f) => f.name))].sort()).toEqual(MESSAGE_CONTRACTS.map((c) => c.name).sort());
        });
        Then("each is refused by its contract", () => {
          for (const { file, name, payload } of fixtures) expect(contract(name).schema.safeParse(payload).success, file).toBe(false);
        });
        And("the reader's server answers 400 to each negative lo-event", async () => {
          for (const { file, payload } of fixtures.filter((f) => f.name === "lo-event")) {
            expect((await postToReaderServer(JSON.stringify(payload))).status, file).toBe(400);
          }
        });
      });
    }
  );
});
