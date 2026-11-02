// @vitest-environment happy-dom
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { convertMdToHtml, initHighlighter } from "../../../../packages/jsr/model/src/utils/markdown-utils.ts";
import { readFileSync } from "node:fs";
import { themeService } from "../../../../packages/svelte/themes/src/services/themes.svelte.ts";
import { startLaterSession, startWithNoStoredPreferences } from "../../support/theme.ts";

// `rune()` needs the Svelte compiler; see the stub for why a plain box is a faithful stand-in.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));

const feature = await loadFeature("tests/bdd/features/developer/theme-customisation.feature");

describeFeature(feature, ({ AfterEachScenario, Rule }) => {
  const root = () => document.documentElement;
  const firstVisit = () => startWithNoStoredPreferences(themeService);
  const selectTheme = (_ctx: unknown, name: string) => themeService.setTheme(name);
  const currentThemeIs = (_ctx: unknown, expected: string) => {
    expect(themeService.currentTheme.value).toBe(expected);
  };
  const themeAttributeIs = (_ctx: unknown, expected: string) => {
    expect(root().getAttribute("data-theme")).toBe(expected);
  };
  const displayModeIs = (_ctx: unknown, expected: string) => {
    expect(themeService.lightMode.value).toBe(expected);
    expect(localStorage.getItem("modeCurrent")).toBe(expected);
  };
  const toggleScheme = () => themeService.toggleDisplayMode();

  AfterEachScenario(() => {
    vi.restoreAllMocks();
  });

  Rule("When a user selects a theme, tutors shall apply and store it, falling back to the Tutors theme for a name it does not offer.", ({ RuleScenario }) => {
    RuleScenario("Switch between available themes", ({ Given, When, Then, And }) => {
      Given("the theme service has started with no stored preferences", firstVisit);
      When("a developer selects the theme {string}", selectTheme);
      Then("the current theme shall be {string}", currentThemeIs);
      And("the document shall carry the theme attribute {string}", themeAttributeIs);
      And("the stored theme preference shall be {string}", (_ctx, expected: string) => {
        expect(localStorage.getItem("theme")).toBe(expected);
      });
      When("a developer then selects the unknown theme {string}", selectTheme);
      Then("the current theme shall fall back to {string}", currentThemeIs);
      And("the document theme attribute shall fall back to {string}", themeAttributeIs);
    });
  });

  Rule("Tutors shall draw icons from the icon library of the selected theme, falling back to the Tutors icon for a type that library does not define.", ({ RuleScenario }) => {
    RuleScenario("Select icon library", ({ Given, When, Then, And }) => {
      const iconIs = (_ctx: unknown, type: string, expected: string) => {
        expect(themeService.getIcon(type).type).toBe(expected);
      };
      Given("the theme service has started with no stored preferences", firstVisit);
      Then("the {string} icon shall be {string}", iconIs);
      When("a developer selects the theme {string}", selectTheme);
      Then("the {string} icon shall change to {string}", iconIs);
      And("an icon type no library defines shall fall back to {string}", (_ctx, expected: string) => {
        // getIcon warns through the logger when it falls back; keep the run quiet.
        vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(themeService.getIcon("no-such-icon-type").type).toBe(expected);
      });
    });
  });

  Rule("When a user toggles the colour scheme, tutors shall switch between light and dark and keep the choice for later sessions.", ({ RuleScenario }) => {
    RuleScenario("Toggle light and dark colour scheme", ({ Given, When, Then, And }) => {
      Given("the theme service has started with no stored preferences", firstVisit);
      When("a developer toggles the colour scheme", toggleScheme);
      Then("the display mode shall be {string}", displayModeIs);
      And("the document shall have the {string} class and the colour scheme {string}", (_ctx, cls: string, scheme: string) => {
        expect(root().classList.contains(cls)).toBe(true);
        expect(root().style.colorScheme).toBe(scheme);
      });
      When("the application starts again in a later session", () => startLaterSession(themeService));
      Then("the display mode shall still be {string}", displayModeIs);
      When("a developer toggles the colour scheme again", toggleScheme);
      Then("the display mode shall return to {string}", displayModeIs);
      And("the document shall not have the {string} class", (_ctx, cls: string) => {
        expect(root().classList.contains(cls)).toBe(false);
        expect(root().style.colorScheme).toBe("light");
      });
    });
  });

  Rule("When the reader renders a fenced code block, the reader shall highlight it for its language in the selected code style.", ({ RuleScenario }) => {
    RuleScenario("Code syntax highlighting follows theme", ({ Given, When, Then, And }) => {
      // Stands in for Shiki, which the reader loads in the browser; the product code under test is the renderer that calls it.
      const codeToHtml = vi.fn((code: string, options: { lang: string; theme: string }) => `<pre class="highlighted ${options.theme}">${code}</pre>`);
      let html: string;

      Given("a syntax highlighter is registered with the markdown renderer", () => {
        initHighlighter({ codeToHtml });
      });
      When("a fenced {string} code block is rendered with the code style {string}", (_ctx, lang: string, style: string) => {
        html = convertMdToHtml(["```" + lang, "const answer = 42;", "```"].join("\n"), style);
      });
      Then("the highlighter shall be asked for the language {string} in the theme {string}", (_ctx, lang: string, theme: string) => {
        expect(codeToHtml).toHaveBeenCalledTimes(1);
        expect(codeToHtml.mock.calls[0][0]).toBe("const answer = 42;\n");
        expect(codeToHtml.mock.calls[0][1]).toMatchObject({ lang, theme });
      });
      And("the rendered HTML shall contain the highlighter's output", () => {
        expect(html).toContain('<pre class="highlighted monokai">const answer = 42;\n</pre>');
      });
    });
  });

  Rule("Tutors shall load the Tutors theme stylesheets in every app through one shared index stylesheet.", ({ RuleScenario }) => {
    RuleScenario("Each app imports the shared theme index", ({ Given, Then, And }) => {
      const STYLES = "packages/svelte/themes/src/styles";
      const apps = ["reader", "catalogue", "live", "time"];
      let sheets: { app: string; css: string }[] = [];
      Given("the stylesheets of the reader, catalogue, live and time apps", () => {
        sheets = apps.map((app) => ({ app, css: readFileSync(`apps/${app}/src/app.css`, "utf8") }));
      });
      Then("each stylesheet shall import {string} once", (_ctx, path: string) => {
        for (const { css } of sheets) expect(css.split(`@import "${path}";`).length - 1).toBe(1);
      });
      And("no stylesheet shall import a Tutors theme stylesheet such as {string} on its own", (_ctx, example: string) => {
        const themeSheets = [...readFileSync(`${STYLES}/index.css`, "utf8").matchAll(/@import\s+"\.\/([\w-]+\.css)"/g)].map((m) => m[1]);
        expect(themeSheets).toContain(example);
        for (const { css } of sheets) {
          for (const file of themeSheets) expect(css).not.toContain(`@tutors/themes/styles/${file}`);
        }
      });
      And("the shared index stylesheet shall declare every theme the theme menu offers", () => {
        const loaded = new Set(
          [...readFileSync(`${STYLES}/index.css`, "utf8").matchAll(/@import\s+"\.\/([\w-]+\.css)"/g)].flatMap(([, file]) =>
            [...readFileSync(`${STYLES}/${file}`, "utf8").matchAll(/\[data-theme="([\w-]+)"\]/g)].map((m) => m[1])
          )
        );
        // Skeleton's own presets (cerberus, terminus, rose) come from @skeletonlabs, not from this package.
        const tutorsThemes = themeService.themes.map((theme) => theme.name).filter((name) => !["cerberus", "terminus", "rose"].includes(name));
        expect(tutorsThemes.length).toBeGreaterThan(0);
        for (const name of tutorsThemes) expect(loaded).toContain(name);
      });
    });
  });
});
