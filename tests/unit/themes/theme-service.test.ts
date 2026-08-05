import { describe, it, expect } from "vitest";
import { ExtendedTestDataFactory } from "../../bdd/support/extended-fixtures";

/**
 * Theme service tests via ExtendedTestDataFactory.
 *
 * The themes package manages visual configuration for the Tutors reader.
 * These tests validate the ThemeConfig creation and its default values.
 */

describe("theme-service: createThemeConfig returns valid structure", () => {
  it("returns an object with all required ThemeConfig fields", () => {
    const factory = new ExtendedTestDataFactory();
    const theme = factory.createThemeConfig();

    expect(theme).toHaveProperty("name");
    expect(theme).toHaveProperty("colorScheme");
    expect(theme).toHaveProperty("primaryColor");
    expect(theme).toHaveProperty("iconLibrary");
  });

  it("has a non-empty name", () => {
    const factory = new ExtendedTestDataFactory();
    const theme = factory.createThemeConfig();
    expect(theme.name.length).toBeGreaterThan(0);
  });
});

describe("theme-service: default colorScheme", () => {
  it("default colorScheme is 'light'", () => {
    const factory = new ExtendedTestDataFactory();
    const theme = factory.createThemeConfig();
    expect(theme.colorScheme).toBe("light");
  });
});

describe("theme-service: default iconLibrary", () => {
  it("default iconLibrary is 'fluent'", () => {
    const factory = new ExtendedTestDataFactory();
    const theme = factory.createThemeConfig();
    expect(theme.iconLibrary).toBe("fluent");
  });
});

describe("theme-service: valid colorScheme values", () => {
  it("accepts 'light' as a valid colorScheme", () => {
    const factory = new ExtendedTestDataFactory();
    const theme = factory.createThemeConfig({ colorScheme: "light" });
    expect(theme.colorScheme).toBe("light");
  });

  it("accepts 'dark' as a valid colorScheme", () => {
    const factory = new ExtendedTestDataFactory();
    const theme = factory.createThemeConfig({ colorScheme: "dark" });
    expect(theme.colorScheme).toBe("dark");
  });
});

describe("theme-service: valid iconLibrary values", () => {
  const validLibraries = ["fluent", "hero", "lucide", "la"] as const;

  for (const lib of validLibraries) {
    it(`accepts '${lib}' as a valid iconLibrary`, () => {
      const factory = new ExtendedTestDataFactory();
      const theme = factory.createThemeConfig({ iconLibrary: lib });
      expect(theme.iconLibrary).toBe(lib);
    });
  }
});

describe("theme-service: overrides", () => {
  it("allows overriding primaryColor", () => {
    const factory = new ExtendedTestDataFactory();
    const theme = factory.createThemeConfig({ primaryColor: "#ff0000" });
    expect(theme.primaryColor).toBe("#ff0000");
  });

  it("preserves defaults for non-overridden fields", () => {
    const factory = new ExtendedTestDataFactory();
    const theme = factory.createThemeConfig({ name: "custom-theme" });
    expect(theme.name).toBe("custom-theme");
    expect(theme.colorScheme).toBe("light");
    expect(theme.iconLibrary).toBe("fluent");
  });
});
