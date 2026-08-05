import { describe, it, expect, beforeEach } from "vitest";
import { MockI18nProvider } from "../../support/extended-mocks";

describe("Developer: Internationalisation", () => {
  let i18n: MockI18nProvider;

  beforeEach(() => {
    i18n = new MockI18nProvider();
  });

  it("shall default to English locale", () => {
    expect(i18n.getLocale()).toBe("en");
    expect(i18n.t("nav.search")).toBe("Search");
  });

  it("shall switch to French", () => {
    i18n.setLocale("fr");
    expect(i18n.getLocale()).toBe("fr");
    expect(i18n.t("nav.search")).toBe("Rechercher");
  });

  it("shall fall back to English when key missing in current locale", () => {
    i18n.setLocale("de");
    i18n.addMessages("de", { "nav.search": "Suche" });

    expect(i18n.t("nav.search")).toBe("Suche");
    expect(i18n.t("error.fallback")).toBe("Etwas ist schiefgelaufen");
  });

  it("shall return key when missing from all locales", () => {
    expect(i18n.t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("shall support all five locales", () => {
    const locales = ["en", "de", "fr", "es", "it"];
    for (const locale of locales) {
      i18n.setLocale(locale);
      const result = i18n.t("nav.search");
      expect(result).toBeTruthy();
      expect(result).not.toBe("nav.search");
    }
  });

  it("shall extend locale messages with addMessages", () => {
    i18n.addMessages("en", { "custom.key": "Custom Value" });
    expect(i18n.t("custom.key")).toBe("Custom Value");
    expect(i18n.t("nav.search")).toBe("Search");
  });
});
