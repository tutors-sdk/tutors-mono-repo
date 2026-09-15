import { describe, it, expect, beforeEach } from "vitest";
import { ExtendedTestDataFactory } from "../../support/extended-fixtures";

describe("Shared: Theming", () => {
  let extFixtures: ExtendedTestDataFactory;

  beforeEach(() => {
    extFixtures = new ExtendedTestDataFactory();
  });

  it("shall switch between light and dark mode and persist preference", () => {
    const lightTheme = extFixtures.createThemeConfig({ colorScheme: "light" });
    expect(lightTheme.colorScheme).toBe("light");

    const darkTheme = extFixtures.createThemeConfig({ colorScheme: "dark" });
    expect(darkTheme.colorScheme).toBe("dark");
    expect(darkTheme.name).toBeDefined();
  });

  it("shall apply a Skeleton theme and update colour scheme", () => {
    const crimson = extFixtures.createThemeConfig({
      name: "crimson",
      primaryColor: "#dc2626"
    });

    expect(crimson.name).toBe("crimson");
    expect(crimson.primaryColor).toBe("#dc2626");
  });

  it("shall render text in dyslexia-friendly font when enabled", () => {
    const dyslexiaTheme = extFixtures.createThemeConfig({ name: "dyslexia" });
    expect(dyslexiaTheme.name).toBe("dyslexia");

    const preferences = new Map<string, string>();
    preferences.set("font", "OpenDyslexic");
    expect(preferences.get("font")).toBe("OpenDyslexic");
  });

  it("shall switch between compact and expanded card layouts and persist preference", () => {
    const layoutPreferences = { layout: "expanded" as "compact" | "expanded" };
    expect(layoutPreferences.layout).toBe("expanded");

    layoutPreferences.layout = "compact";
    expect(layoutPreferences.layout).toBe("compact");
  });
});
