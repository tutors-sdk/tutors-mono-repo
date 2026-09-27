// @vitest-environment happy-dom
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { SUPPORTED_LOCALES, initLocaleFromCookie, locale, setLocale, t, type MessageKey, type SupportedLocale } from "../../../../packages/svelte/utils/i18n/src/index.ts";
import de from "../../../../packages/svelte/utils/i18n/src/messages/de.ts";

// `rune()` needs the Svelte compiler; see the stub for why a plain box is a faithful stand-in.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));

const feature = await loadFeature("tests/bdd/features/developer/i18n-localisation.feature");

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario, ScenarioOutline }) => {
  let cookieHeader: string | undefined;
  let cookieWrites: string[];
  let removed: Record<string, string>;

  const translatesTo = (_ctx: unknown, key: string, expected: string) => {
    expect(t(key as MessageKey)).toBe(expected);
  };
  // What the reader does per request: hooks.server.ts resolves the locale and +layout.svelte stores it.
  const initialise = () => {
    locale.value = initLocaleFromCookie(cookieHeader);
  };
  const localeIs = (_ctx: unknown, expected: string) => {
    expect(locale.value).toBe(expected);
  };

  BeforeEachScenario(() => {
    locale.value = "en";
    cookieHeader = undefined;
    cookieWrites = [];
    removed = {};
    document.documentElement.lang = "";
    vi.spyOn(document, "cookie", "set").mockImplementation((value: string) => {
      cookieWrites.push(value);
    });
  });

  AfterEachScenario(() => {
    Object.assign(de, removed);
    vi.restoreAllMocks();
  });

  Scenario("Default language is English", ({ Given, When, Then, And }) => {
    Given("a request arrives with no cookie header", () => {
      cookieHeader = undefined;
    });
    When("the locale is initialised from the cookie header", initialise);
    Then("the locale shall be {string}", localeIs);
    And("the key {string} shall translate to {string}", translatesTo);
  });

  Scenario("Switch language", ({ When, Then, And }) => {
    When("a user selects the locale {string}", (_ctx, chosen: string) => {
      setLocale(chosen as SupportedLocale);
    });
    Then("the key {string} shall translate to {string}", translatesTo);
    And("the document language shall be {string}", (_ctx, expected: string) => {
      expect(document.documentElement.lang).toBe(expected);
    });
    And("the locale shall be persisted in the cookie {string}", (_ctx, expected: string) => {
      expect(cookieWrites).toEqual([expected]);
    });
  });

  Scenario("Fallback to English for missing translations", ({ Given, And, Then }) => {
    Given("the current locale is {string}", (_ctx, current: string) => {
      locale.value = current as SupportedLocale;
    });
    And("the {string} messages have no translation for {string}", (_ctx, _locale: string, key: string) => {
      // `de` is the very object the i18n module translates from, so removing the key is a real gap.
      removed[key] = de[key];
      delete de[key];
    });
    Then("the key {string} shall translate to {string}", translatesTo);
    And("the key {string} shall translate to {string}", translatesTo);
  });

  Scenario("Support six locales", ({ Given, Then, And }) => {
    Given("the i18n module is loaded", () => {
      expect(t).toBeTypeOf("function");
    });
    Then("the supported locales shall be {string}", (_ctx, expected: string) => {
      expect([...SUPPORTED_LOCALES]).toEqual(expected.split(", "));
    });
    And("every supported locale shall translate {string} into its own distinct text", (_ctx, key: string) => {
      const texts = SUPPORTED_LOCALES.map((supported) => {
        locale.value = supported;
        return t(key as MessageKey);
      });
      for (const text of texts) expect(text).not.toBe(key);
      expect(new Set(texts).size).toBe(SUPPORTED_LOCALES.length);
    });
  });

  ScenarioOutline("Locale initialised from cookie", ({ Given, When, Then, And }, variables) => {
    Given("a returning user sends the cookie header {string}", () => {
      cookieHeader = variables.cookie;
    });
    When("the locale is initialised from the cookie header", initialise);
    Then("the locale shall be {string}", () => localeIs(undefined, variables.locale));
    And("the key {string} shall translate to {string}", () => translatesTo(undefined, "nav.search", variables.search));
  });
});
