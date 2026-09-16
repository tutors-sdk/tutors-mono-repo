import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  THEMES_DIR,
  extractTranslationKeys,
  githubSlug,
  headingAnchors,
  i18nFindings,
  iconLibraryFindings,
  linkFindings,
  loadRepoMessages,
  offeredThemes,
  readmeFindings,
  repoLinkFindings,
  repoReadmeFindings,
  themeRegistryFindings,
  themeTokenFindings,
  themesLoadedBy,
  trackedFiles
} from "../../scripts/checks/completeness.ts";
import { describeRatchet, ratchet } from "../../scripts/checks/lib/ratchet.ts";
import { REPO_ROOT, readBaseline, readText, toPosix, walk } from "../../scripts/checks/lib/repo.ts";
import { FluentIconLib } from "../../packages/svelte/themes/src/icons/fluent-icons.ts";
import { HeroIconLib } from "../../packages/svelte/themes/src/icons/hero-icons.ts";
import { EasterIcons } from "../../packages/svelte/themes/src/icons/easter-icons.ts";
import { FestiveIcons } from "../../packages/svelte/themes/src/icons/festive-icons.ts";

const BASELINE = "tests/completeness/known-gaps.txt";
const STYLES = join(REPO_ROOT, THEMES_DIR, "styles");

describe("completeness (runway tier N)", () => {
  describe("negative fixtures", () => {
    it("i18n: flags a missing translation, an orphan key, a blank value, an unknown key and an undeclared locale", () => {
      const messages = {
        en: { "nav.search": "Search", "nav.home": "Home" },
        fr: { "nav.search": "Rechercher", "nav.gone": "Parti" },
        de: { "nav.search": " ", "nav.home": "Startseite" }
      };
      const used = [
        { file: "Nav.svelte", key: "nav.search" },
        { file: "Nav.svelte", key: "nav.typo" }
      ];
      expect(i18nFindings(messages, ["en", "fr", "de", "ga"], used)).toEqual([
        "empty-translation: de: nav.search",
        "locale-without-messages: ga",
        "missing-translation: fr: nav.home",
        "orphan-key: fr: nav.gone",
        "unknown-key: Nav.svelte: nav.typo"
      ]);
    });

    it("i18n: extracts literal t() keys but not other calls ending in t", () => {
      const source = `{t("nav.search")} {t('menu.home')} {format("x")} {obj.t("not.me")} {getT("no")}`;
      expect(extractTranslationKeys("A.svelte", source).map((u) => u.key)).toEqual(["nav.search", "menu.home"]);
    });

    it("themes: flags a theme stylesheet missing a base token", () => {
      const base = { name: "tutors", css: `[data-theme="tutors"] { --a: 1; --b: 2; }` };
      const theme = { name: "classic", css: `[data-theme="classic"] { --a: 3; }` };
      expect(themeTokenFindings(base, [theme])).toEqual(["missing-token: classic: --b"]);
    });

    it("themes: flags a theme offered in the menu but never loaded by the app stylesheet", () => {
      const appCss = `@import "@skeletonlabs/skeleton/themes/rose";\n@import "@tutors/themes/styles/tutors.css";`;
      const loaded = themesLoadedBy(appCss, () => `[data-theme="tutors"] {}`);
      expect(loaded).toEqual(["rose", "tutors"]);
      expect(themeRegistryFindings(["tutors", "rose", "easter"], loaded, "reader")).toEqual([
        "theme-not-loaded: reader: easter"
      ]);
      expect(offeredThemes(`themes: [{ name: "tutors", icons: A }, { name: "rose", icons: A }]`)).toEqual(["tutors", "rose"]);
    });

    it("icons: flags a library missing an icon the base library defines", () => {
      expect(iconLibraryFindings({ name: "Base", icons: { a: 1, b: 2 } }, [{ name: "Alt", icons: { a: 1 } }])).toEqual([
        "missing-icon: Alt: b"
      ]);
    });

    it("docs: flags dead file links and dead anchors, ignoring URLs and code", () => {
      const files = new Map<string, string | undefined>([
        ["docs/guide.md", "# Guide\n\n## Getting Started\n"],
        ["docs/img.png", undefined],
        ["packages/svelte/runes/src/index.ts", undefined]
      ]);
      const markdown = [
        "[ok](guide.md) [ok anchor](guide.md#getting-started) [img](./img.png) [dir](../packages/svelte/runes)",
        "[url](https://tutors.dev) [mail](mailto:a@b.c) [self](#readme)",
        "[gone](missing.md) [bad anchor](guide.md#nope)",
        "`[inline](nowhere.md)`",
        "```md",
        "[fenced](nowhere.md)",
        "```",
        "# Readme"
      ].join("\n");
      expect(linkFindings("docs/README.md", markdown, files)).toEqual([
        "dead-link: docs/README.md: missing.md",
        "dead-anchor: docs/README.md: guide.md#nope"
      ]);
    });

    it("docs: computes GitHub anchors, including duplicates", () => {
      expect(githubSlug("Tier 1: TDD Unit Tests (`tests/unit/`)")).toBe("tier-1-tdd-unit-tests-testsunit");
      expect([...headingAnchors("## Setup\n## Setup\n")]).toEqual(["setup", "setup-1"]);
    });

    it("READMEs: flags a missing README, an unlisted dependency and a package that does not exist", () => {
      const workspace = new Set(["@tutors/course", "@tutors/themes"]);
      expect(readmeFindings("apps/time", undefined, ["@tutors/course"], workspace)).toEqual(["readme-missing: apps/time"]);
      expect(readmeFindings("apps/reader", "- `@tutors/course`\n- `@tutors/ui`", ["@tutors/course", "@tutors/themes", "svelte"], workspace)).toEqual([
        "readme-unknown-package: apps/reader: @tutors/ui",
        "readme-unlisted-package: apps/reader: @tutors/themes"
      ]);
      expect(readmeFindings("apps/x", undefined, ["svelte"], workspace)).toEqual([]);
    });
  });

  it("scans real documentation", () => {
    expect(trackedFiles().filter((f) => f.endsWith(".md")).length).toBeGreaterThan(10);
  });

  it("the repo adds no gaps beyond the baseline, and the baseline has no stale entries", async () => {
    const { messages, declared } = await loadRepoMessages();
    const used = ["apps", "packages/svelte"]
      .flatMap((dir) => walk(join(REPO_ROOT, dir), (name) => /\.(svelte|ts)$/.test(name)))
      .flatMap((path) => extractTranslationKeys(toPosix(path), readText(path)));

    const themes = ["classic", "dyslexia", "easter"].map((name) => ({ name, css: readText(join(STYLES, `${name}.css`)) }));
    const offered = offeredThemes(readText(join(REPO_ROOT, THEMES_DIR, "services/themes.svelte.ts")));
    // Only apps that depend on @tutors/themes show the theme menu.
    const themedApps = ["reader", "catalogue", "live", "time"].filter((app) =>
      readText(join(REPO_ROOT, "apps", app, "package.json")).includes('"@tutors/themes"')
    );

    const current = [
      ...i18nFindings(messages, declared, used),
      ...themeTokenFindings({ name: "tutors", css: readText(join(STYLES, "tutors.css")) }, themes),
      ...themedApps.flatMap((app) =>
        themeRegistryFindings(
          offered,
          themesLoadedBy(readText(join(REPO_ROOT, "apps", app, "src/app.css")), (file) => readText(join(STYLES, file))),
          app
        )
      ),
      ...iconLibraryFindings({ name: "FluentIconLib", icons: FluentIconLib }, [
        { name: "HeroIconLib", icons: HeroIconLib },
        { name: "EasterIcons", icons: EasterIcons },
        { name: "FestiveIcons", icons: FestiveIcons }
      ]),
      ...repoLinkFindings(),
      ...repoReadmeFindings()
    ];
    const result = ratchet(current, readBaseline(resolve(REPO_ROOT, BASELINE)));
    expect(result, describeRatchet("completeness", BASELINE, result)).toEqual({ added: [], stale: [] });
    // Imports every locale and walks the tree; slow on a cold cache under a parallel run.
  }, 60_000);
});
