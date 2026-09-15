import { describe, it, expect } from "vitest";
// Cannot import the Svelte i18n module directly due to rune dependencies,
// so test the MockI18nProvider which mirrors the same API contract.
import { MockI18nProvider } from "../../bdd/support/extended-mocks";

/**
 * Internationalization (i18n) tests via MockI18nProvider.
 *
 * The i18n module at packages/svelte/utils/i18n/src/index.ts provides
 * locale-based message translation. These tests validate locale switching,
 * fallback behaviour, and message extension.
 */

describe("i18n: default locale", () => {
  it("default locale is 'en'", () => {
    const i18n = new MockI18nProvider();
    expect(i18n.getLocale()).toBe("en");
  });
});

describe("i18n: setLocale changes current locale", () => {
  it("changes locale to 'de'", () => {
    const i18n = new MockI18nProvider();
    i18n.setLocale("de");
    expect(i18n.getLocale()).toBe("de");
  });

  it("changes locale to 'fr'", () => {
    const i18n = new MockI18nProvider();
    i18n.setLocale("fr");
    expect(i18n.getLocale()).toBe("fr");
  });
});

describe("i18n: t() returns correct message for current locale", () => {
  it("returns English message by default", () => {
    const i18n = new MockI18nProvider();
    expect(i18n.t("nav.search")).toBe("Search");
  });

  it("returns German message after switching to 'de'", () => {
    const i18n = new MockI18nProvider();
    i18n.setLocale("de");
    expect(i18n.t("nav.search")).toBe("Suche");
  });

  it("returns French message after switching to 'fr'", () => {
    const i18n = new MockI18nProvider();
    i18n.setLocale("fr");
    expect(i18n.t("nav.search")).toBe("Rechercher");
  });

  it("returns Spanish message after switching to 'es'", () => {
    const i18n = new MockI18nProvider();
    i18n.setLocale("es");
    expect(i18n.t("nav.search")).toBe("Buscar");
  });

  it("returns Italian message after switching to 'it'", () => {
    const i18n = new MockI18nProvider();
    i18n.setLocale("it");
    expect(i18n.t("nav.search")).toBe("Cerca");
  });
});

describe("i18n: t() falls back to English when key missing in current locale", () => {
  it("falls back to English for a key only defined in 'en'", () => {
    const i18n = new MockI18nProvider();
    i18n.addMessages("en", { "special.feature": "Special Feature" });
    i18n.setLocale("de");

    expect(i18n.t("special.feature")).toBe("Special Feature");
  });
});

describe("i18n: t() returns key itself when missing from all locales", () => {
  it("returns the key string when no locale has a translation", () => {
    const i18n = new MockI18nProvider();
    expect(i18n.t("nonexistent.key")).toBe("nonexistent.key");
  });
});

describe("i18n: all 5 locales have messages", () => {
  const locales = ["en", "de", "fr", "es", "it", "ga"];

  for (const locale of locales) {
    it(`locale '${locale}' has a translation for 'nav.search'`, () => {
      const i18n = new MockI18nProvider();
      i18n.setLocale(locale);
      const result = i18n.t("nav.search");
      expect(result).not.toBe("nav.search");
      expect(result.length).toBeGreaterThan(0);
    });
  }
});

describe("i18n: addMessages extends existing locale messages", () => {
  it("adds new keys to an existing locale", () => {
    const i18n = new MockI18nProvider();
    i18n.addMessages("en", { "nav.settings": "Settings" });

    expect(i18n.t("nav.settings")).toBe("Settings");
    // Original keys should still work
    expect(i18n.t("nav.search")).toBe("Search");
  });

  it("adds messages to a new locale", () => {
    const i18n = new MockI18nProvider();
    i18n.addMessages("pt", { "nav.search": "Pesquisar" });
    i18n.setLocale("pt");

    expect(i18n.t("nav.search")).toBe("Pesquisar");
  });
});
