import { describe, it, expect, beforeEach } from "vitest";
import { ExtendedTestDataFactory } from "../../support/extended-fixtures";

describe("Developer: Theme Customisation", () => {
  let factory: ExtendedTestDataFactory;

  beforeEach(() => {
    factory = new ExtendedTestDataFactory();
  });

  it("shall apply new theme colour tokens", () => {
    const theme = factory.createThemeConfig({ name: "skeleton", primaryColor: "#6366f1" });
    expect(theme.name).toBe("skeleton");
    expect(theme.primaryColor).toBe("#6366f1");
  });

  it("shall offer all four icon libraries", () => {
    const libraries = ["fluent", "hero", "lucide", "la"] as const;
    for (const lib of libraries) {
      const config = factory.createThemeConfig({ iconLibrary: lib });
      expect(config.iconLibrary).toBe(lib);
    }
  });

  it("shall toggle between light and dark colour schemes", () => {
    const light = factory.createThemeConfig({ colorScheme: "light" });
    const dark = factory.createThemeConfig({ colorScheme: "dark" });

    expect(light.colorScheme).toBe("light");
    expect(dark.colorScheme).toBe("dark");
  });

  it("shall support course-specific theme override", () => {
    const globalTheme = factory.createThemeConfig({ name: "tutors" });
    const courseTheme = factory.createThemeConfig({ name: "course-custom", primaryColor: "#ef4444" });

    expect(courseTheme.name).not.toBe(globalTheme.name);
    expect(courseTheme.primaryColor).toBe("#ef4444");
  });

  it("shall default to fluent icon library", () => {
    const theme = factory.createThemeConfig();
    expect(theme.iconLibrary).toBe("fluent");
  });
});
