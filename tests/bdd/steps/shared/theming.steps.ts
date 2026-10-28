// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { themeService } from "../../../../packages/svelte/themes/src/services/themes.svelte.ts";
import { startLaterSession, startWithNoStoredPreferences } from "../../support/theme.ts";

// `rune()` needs the Svelte compiler; see the stub for why a plain box is a faithful stand-in.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));

const feature = await loadFeature("tests/bdd/features/shared/theming.feature");

describeFeature(feature, ({ Rule }) => {
  const viewingInLightMode = () => {
    startWithNoStoredPreferences(themeService);
    expect(themeService.lightMode.value).toBe("light");
  };
  const selectTheme = (_ctx: unknown, name: string) => themeService.setTheme(name);
  const themeAttributeIs = (_ctx: unknown, expected: string) => {
    expect(document.documentElement.getAttribute("data-theme")).toBe(expected);
  };
  const storedPreferenceIs = (_ctx: unknown, key: string, expected: string) => {
    expect(localStorage.getItem(key)).toBe(expected);
  };

  Rule("When a user turns on dark mode, tutors shall show the interface in dark mode and store the mode preference as dark.", ({ RuleScenario }) => {
    RuleScenario("Switch between light and dark mode", ({ Given, When, Then, And }) => {
      Given("I am viewing a course in light mode", viewingInLightMode);
      When("I toggle the dark mode switch", () => themeService.toggleDisplayMode());
      Then("the interface should switch to {string} mode", (_ctx, mode: string) => {
        expect(themeService.lightMode.value).toBe(mode);
        expect(document.documentElement.classList.contains(mode)).toBe(true);
        expect(document.documentElement.style.colorScheme).toBe(mode);
      });
      And("the stored {string} preference should be {string}", storedPreferenceIs);
    });
  });

  Rule("When a user selects one of the 7 themes, tutors shall set it on the document and store it as the theme preference.", ({ RuleScenario }) => {
    RuleScenario("Apply a Skeleton theme", ({ Given, When, Then, And }) => {
      Given("the platform offers the themes {string}", (_ctx, names: string) => {
        startWithNoStoredPreferences(themeService);
        expect(themeService.themes.map((theme) => theme.name)).toEqual(names.split(", "));
      });
      When("I select the {string} theme", selectTheme);
      Then("the document theme attribute should be {string}", themeAttributeIs);
      And("the stored {string} preference should be {string}", storedPreferenceIs);
    });
  });

  Rule("When a user selects the dyslexia theme, tutors shall set the OpenDyslexic font and start later sessions with that theme.", ({ RuleScenario }) => {
    RuleScenario("Enable dyslexia-friendly font", ({ Given, When, Then, And }) => {
      Given("I am viewing a course in light mode", viewingInLightMode);
      When("I select the {string} theme", selectTheme);
      Then("the document theme attribute should be {string}", themeAttributeIs);
      And("the {string} stylesheet should set the base font family to {string}", (_ctx, name: string, fontFamily: string) => {
        const css = readFileSync(`packages/svelte/themes/src/styles/${name}.css`, "utf8");
        const block = css.slice(css.indexOf(`[data-theme="${name}"] {`));
        expect(block.slice(0, block.indexOf("}"))).toContain(`--base-font-family: ${fontFamily};`);
      });
      And("a later session should start with the {string} theme", (_ctx, expected: string) => {
        startLaterSession(themeService);
        expect(themeService.currentTheme.value).toBe(expected);
        expect(document.documentElement.getAttribute("data-theme")).toBe(expected);
      });
    });
  });
});
