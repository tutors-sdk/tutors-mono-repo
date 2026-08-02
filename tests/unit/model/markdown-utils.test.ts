import { describe, it, expect } from "vitest";
import { removeLeadingHashes } from "../../../packages/jsr/model/src/utils/lo-utils";

/**
 * Thorough tests for removeLeadingHashes -- the primary markdown utility
 * exported from lo-utils. The function removes everything up to and
 * including the last '#' character in the string.
 */
describe("removeLeadingHashes", () => {
  it("removes a single leading # from a title", () => {
    expect(removeLeadingHashes("#Title")).toBe("Title");
  });

  it("removes double leading ## and preserves the space", () => {
    expect(removeLeadingHashes("## Title")).toBe(" Title");
  });

  it("removes triple ### hashes", () => {
    expect(removeLeadingHashes("###Sub")).toBe("Sub");
  });

  it("returns the original string when no # is present", () => {
    expect(removeLeadingHashes("no-hash")).toBe("no-hash");
  });

  it("handles a string that is only hashes", () => {
    expect(removeLeadingHashes("###")).toBe("");
  });

  it("handles # at the end of the string", () => {
    expect(removeLeadingHashes("Title#")).toBe("");
  });

  it("returns text after the last # when multiple # groups exist", () => {
    // e.g. "## Heading # Sub" -> " Sub"
    expect(removeLeadingHashes("## Heading # Sub")).toBe(" Sub");
  });

  it("handles an empty string", () => {
    expect(removeLeadingHashes("")).toBe("");
  });

  it("handles strings with hash in the middle", () => {
    expect(removeLeadingHashes("C#Programming")).toBe("Programming");
  });

  it("handles quadruple #### headers", () => {
    expect(removeLeadingHashes("#### Deep Heading")).toBe(" Deep Heading");
  });
});
