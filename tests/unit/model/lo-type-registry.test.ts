import { describe, it, expect } from "vitest";
import {
  registerLoType,
  getLoTypeDefinition,
  registeredLoTypes,
  simpleTypes,
  loCompositeTypes,
  loTypes,
  preOrder,
  isCompositeLo
} from "@tutors/tutors-model-lib";
import type { Lo } from "@tutors/tutors-model-lib";

describe("registerLoType", () => {
  it("adds a simple type to the model lists and ordering", () => {
    const before = simpleTypes.length;
    registerLoType({ type: "registry-simple", icon: { type: "fluent:box-24-filled", color: "primary" } });

    expect(simpleTypes).toContain("registry-simple");
    expect(simpleTypes.length).toBe(before + 1);
    expect(loTypes).toContain("registry-simple");
    expect(loCompositeTypes).not.toContain("registry-simple");
    expect(preOrder.has("registry-simple")).toBe(true);
    expect(getLoTypeDefinition("registry-simple")?.icon?.type).toBe("fluent:box-24-filled");
  });

  it("adds a composite type so isCompositeLo recognises it", () => {
    registerLoType({ type: "registry-composite", composite: true });

    expect(loCompositeTypes).toContain("registry-composite");
    expect(isCompositeLo({ type: "registry-composite" } as Lo)).toBe(true);
  });

  it("does not duplicate list entries when registered twice", () => {
    registerLoType({ type: "registry-twice" });
    const count = loTypes.filter((t) => t === "registry-twice").length;
    registerLoType({ type: "registry-twice", order: 99 });

    expect(loTypes.filter((t) => t === "registry-twice").length).toBe(count);
    expect(preOrder.get("registry-twice")).toBe(99);
  });

  it("appends unordered types after everything already known", () => {
    const largest = Math.max(...[...preOrder.values()]);
    registerLoType({ type: "registry-last" });

    expect(preOrder.get("registry-last")).toBeGreaterThan(largest);
  });

  it("lists registrations in order", () => {
    const types = registeredLoTypes().map((d) => d.type);
    expect(types.indexOf("registry-simple")).toBeLessThan(types.indexOf("registry-last"));
  });

  it("returns undefined for built-in types that were never registered", () => {
    expect(getLoTypeDefinition("lab")).toBeUndefined();
  });
});
