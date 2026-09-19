import { describe, expect, it } from "vitest";
import {
  EVENT_TYPES,
  MAX_BATCH_SIZE,
  MAX_FIELD_LENGTH,
  SERVICES,
  SUBJECT_WILDCARD,
  coarsenToMinute,
  isService,
  parseLiveEvent,
  parseLiveEvents,
  serviceForLoType,
  subjectFor
} from "@tutors/live-events";

/**
 * The event contract. Everything downstream trusts `parseLiveEvent` to have
 * thrown out anything a public, unauthenticated endpoint should not believe,
 * so the rejections matter as much as the acceptances.
 */

const ts = "2026-09-17T10:15:42.500Z";

describe("live event contract", () => {
  describe("service catalogue", () => {
    it("names every service the plan lists, and nothing else", () => {
      expect([...SERVICES]).toEqual([
        "reader",
        "search",
        "tutors-time",
        "live",
        "pdf",
        "video",
        "notes",
        "talk",
        "lab",
        "web-link",
        "github",
        "archive"
      ]);
      expect(isService("lab")).toBe(true);
      expect(isService("Lab")).toBe(false);
      expect(isService(undefined)).toBe(false);
    });

    it("maps learning object types onto services, and leaves composites unmapped", () => {
      expect(serviceForLoType("lab")).toBe("lab");
      expect(serviceForLoType("note")).toBe("notes");
      expect(serviceForLoType("paneltalk")).toBe("pdf");
      expect(serviceForLoType("podcast")).toBe("video");
      expect(serviceForLoType("topic")).toBeUndefined();
      expect(serviceForLoType(undefined)).toBeUndefined();
    });
  });

  describe("subjects", () => {
    it("publishes each type on tutors.live.<type>, under one wildcard", () => {
      expect(EVENT_TYPES.map(subjectFor)).toEqual([
        "tutors.live.session.started",
        "tutors.live.session.heartbeat",
        "tutors.live.course.opened",
        "tutors.live.lo.viewed",
        "tutors.live.service.used",
        "tutors.live.session.ended"
      ]);
      expect(SUBJECT_WILDCARD).toBe("tutors.live.*");
    });
  });

  describe("parsing one event", () => {
    it("accepts each kind and keeps only its known fields", () => {
      const parsed = parseLiveEvent({ type: "lo.viewed", ts, sid: "s1", course: "cs101", lo: "/topic/1", loType: "lab", extra: "dropped" });
      expect(parsed).toEqual({ event: { type: "lo.viewed", ts, sid: "s1", course: "cs101", lo: "/topic/1", loType: "lab" } });

      expect(parseLiveEvent({ type: "service.used", ts, sid: "s1", course: "cs101", service: "pdf" })).toEqual({
        event: { type: "service.used", ts, sid: "s1", course: "cs101", service: "pdf" }
      });
      expect(parseLiveEvent({ type: "session.ended", ts, sid: "s1", course: "cs101", durationSec: 12.6 })).toEqual({
        event: { type: "session.ended", ts, sid: "s1", course: "cs101", durationSec: 13 }
      });
    });

    it("keeps uid only when it is there, because it is there only on opt-in", () => {
      expect(parseLiveEvent({ type: "session.started", ts, sid: "s1", course: "cs101" })).toEqual({
        event: { type: "session.started", ts, sid: "s1", course: "cs101" }
      });
      expect(parseLiveEvent({ type: "session.started", ts, sid: "s1", course: "cs101", uid: "abc" })).toEqual({
        event: { type: "session.started", ts, sid: "s1", course: "cs101", uid: "abc" }
      });
    });

    it.each([
      ["not an object", 42, "not an object"],
      ["an unknown type", { type: "session.hijacked", ts, sid: "s1", course: "c" }, "unknown type: session.hijacked"],
      ["a bad timestamp", { type: "course.opened", ts: "yesterday", sid: "s1", course: "c" }, "invalid ts"],
      ["a missing sid", { type: "course.opened", ts, course: "c" }, "invalid sid"],
      ["a blank course", { type: "course.opened", ts, sid: "s1", course: "   " }, "invalid course"],
      ["an uncatalogued service", { type: "service.used", ts, sid: "s1", course: "c", service: "mainframe" }, "unknown service: mainframe"],
      ["a negative duration", { type: "session.ended", ts, sid: "s1", course: "c", durationSec: -1 }, "invalid durationSec"],
      ["a missing loType", { type: "lo.viewed", ts, sid: "s1", course: "c", lo: "/x" }, "invalid loType"]
    ])("rejects %s", (_name, input, reason) => {
      expect(parseLiveEvent(input)).toEqual({ reason });
    });

    it("rejects an over-long field rather than truncating it", () => {
      const long = "x".repeat(MAX_FIELD_LENGTH + 1);
      expect(parseLiveEvent({ type: "course.opened", ts, sid: long, course: "c" })).toEqual({ reason: "invalid sid" });
    });
  });

  describe("parsing a batch", () => {
    it("keeps the good events and reports the rest by index", () => {
      const { events, rejected } = parseLiveEvents([
        { type: "course.opened", ts, sid: "s1", course: "cs101" },
        { type: "course.opened", ts, sid: "", course: "cs101" },
        { type: "session.heartbeat", ts, sid: "s1", course: "cs101" }
      ]);
      expect(events.map((event) => event.type)).toEqual(["course.opened", "session.heartbeat"]);
      expect(rejected).toEqual([{ index: 1, reason: "invalid sid" }]);
    });

    it("refuses a batch that is not an array, or is larger than the limit", () => {
      expect(parseLiveEvents({}).rejected).toEqual([{ index: 0, reason: "not an array" }]);
      const oversized = Array.from({ length: MAX_BATCH_SIZE + 1 }, () => ({ type: "course.opened", ts, sid: "s1", course: "c" }));
      expect(parseLiveEvents(oversized)).toEqual({ events: [], rejected: [{ index: 0, reason: `batch larger than ${MAX_BATCH_SIZE}` }] });
    });
  });

  describe("coarsening", () => {
    it("drops seconds and milliseconds, which is what reaches storage", () => {
      expect(coarsenToMinute("2026-09-17T10:15:42.500Z")).toBe("2026-09-17T10:15:00.000Z");
      expect(coarsenToMinute("2026-09-17T10:15:00.000Z")).toBe("2026-09-17T10:15:00.000Z");
    });

    it("throws on something that is not a timestamp rather than inventing one", () => {
      expect(() => coarsenToMinute("soon")).toThrow(RangeError);
    });
  });
});
