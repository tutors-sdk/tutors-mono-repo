import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, readText } from "./lib/repo.ts";

/**
 * Completeness checks (runway tier N): translations, themes, icon libraries,
 * documentation links and app READMEs. Each function returns findings as
 * `kind: subject: detail` lines so they can be ratcheted against a baseline.
 */

/* ---------------- i18n ---------------- */

export type Messages = Record<string, Record<string, string>>;

/**
 * `en` is the source locale. Every other locale must translate every `en`
 * key, carry no keys `en` lacks, and leave nothing blank; every `t("key")`
 * call in source must name a key that exists.
 */
export function i18nFindings(
  messages: Messages,
  declaredLocales: string[],
  usedKeys: { file: string; key: string }[],
  source = "en"
): string[] {
  const findings: string[] = [];
  const base = messages[source] ?? {};
  for (const locale of declaredLocales) {
    if (!messages[locale]) findings.push(`locale-without-messages: ${locale}`);
  }
  for (const locale of Object.keys(messages)) {
    if (!declaredLocales.includes(locale)) findings.push(`messages-without-locale: ${locale}`);
  }
  for (const [locale, table] of Object.entries(messages)) {
    for (const [key, value] of Object.entries(table)) {
      if (locale !== source && !(key in base)) findings.push(`orphan-key: ${locale}: ${key}`);
      if (value.trim() === "") findings.push(`empty-translation: ${locale}: ${key}`);
    }
    if (locale === source) continue;
    for (const key of Object.keys(base)) {
      if (!(key in table)) findings.push(`missing-translation: ${locale}: ${key}`);
    }
  }
  for (const { file, key } of usedKeys) {
    if (!(key in base)) findings.push(`unknown-key: ${file}: ${key}`);
  }
  return [...new Set(findings)].sort();
}

/** Literal keys passed to `t(...)` in Svelte and TypeScript source. Dynamic keys are out of reach. */
export function extractTranslationKeys(file: string, text: string): { file: string; key: string }[] {
  return [...text.matchAll(/(?<![\w$.])t\(\s*["'`]([A-Za-z0-9_.-]+)["'`]\s*\)/g)].map((m) => ({ file, key: m[1] }));
}

const I18N_DIR = "packages/svelte/utils/i18n/src";

export async function loadRepoMessages(root: string = REPO_ROOT): Promise<{ messages: Messages; declared: string[] }> {
  const dir = join(root, I18N_DIR, "messages");
  const messages: Messages = {};
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
    const module = await import(pathToFileURL(join(dir, name)).href);
    messages[name.replace(/\.ts$/, "")] = module.default;
  }
  const index = readText(join(root, I18N_DIR, "index.ts"));
  const declared = [...(index.match(/SUPPORTED_LOCALES\s*=\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z-]+)"/g)].map(
    (m) => m[1]
  );
  return { messages, declared };
}

/* ---------------- themes ---------------- */

/** Custom properties declared in a stylesheet, e.g. `--base-font-color`. */
export function cssTokens(css: string): Set<string> {
  return new Set([...css.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

export function dataThemes(css: string): string[] {
  return [...css.matchAll(/\[data-theme=["']([^"']+)["']\]/g)].map((m) => m[1]);
}

/** Every theme stylesheet defines every token the base theme defines. */
export function themeTokenFindings(base: { name: string; css: string }, themes: { name: string; css: string }[]): string[] {
  const required = cssTokens(base.css);
  return themes
    .flatMap(({ name, css }) => {
      const present = cssTokens(css);
      return [...required].filter((token) => !present.has(token)).map((token) => `missing-token: ${name}: ${token}`);
    })
    .sort();
}

/** Every theme offered in the theme menu is actually loaded by the app stylesheet. */
export function themeRegistryFindings(offered: string[], provided: Iterable<string>, app: string): string[] {
  const available = new Set(provided);
  return offered.filter((name) => !available.has(name)).map((name) => `theme-not-loaded: ${app}: ${name}`);
}

/** Themes an app stylesheet loads: Skeleton presets by import path, Tutors themes by their `data-theme` selector. */
export function themesLoadedBy(appCss: string, resolveTutorsStyle: (file: string) => string): string[] {
  const themes: string[] = [];
  for (const [, preset] of appCss.matchAll(/@import\s+["']@skeletonlabs\/skeleton\/themes\/([\w-]+)["']/g)) {
    themes.push(preset);
  }
  for (const [, file] of appCss.matchAll(/@import\s+["']@tutors\/themes\/styles\/([\w-]+\.css)["']/g)) {
    themes.push(...dataThemes(resolveTutorsStyle(file)));
  }
  return themes;
}

export function offeredThemes(themeServiceSource: string): string[] {
  return [...themeServiceSource.matchAll(/\{\s*name:\s*"([\w-]+)"/g)].map((m) => m[1]);
}

/* ---------------- icon libraries ---------------- */

export function iconLibraryFindings(base: { name: string; icons: object }, libraries: { name: string; icons: object }[]): string[] {
  const required = Object.keys(base.icons);
  return libraries
    .flatMap(({ name, icons }) => required.filter((key) => !(key in icons)).map((key) => `missing-icon: ${name}: ${key}`))
    .sort();
}

/* ---------------- documentation links ---------------- */

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
export function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

function stripCode(markdown: string): string {
  return markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
}

export function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const [, text] of stripCode(markdown).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = githubSlug(text);
    const count = seen.get(slug) ?? 0;
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
    seen.set(slug, count + 1);
  }
  for (const [, id] of markdown.matchAll(/<a\s+(?:name|id)=["']([^"']+)["']/g)) anchors.add(id);
  return anchors;
}

/**
 * Relative links in a markdown file that point at a missing file or a missing
 * heading. `files` maps repo-relative paths to contents (or undefined for
 * non-markdown files that exist).
 */
export function linkFindings(file: string, markdown: string, files: Map<string, string | undefined>): string[] {
  const findings: string[] = [];
  const links = [...stripCode(markdown).matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]);
  for (const link of links) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith("//")) continue;
    const [rawPath, anchor] = link.split("#");
    const path = decodeURIComponent(rawPath);
    let target = file;
    if (path !== "") {
      target = path.startsWith("/") ? path.slice(1) : posix.normalize(posix.join(posix.dirname(file), path));
      target = target.replace(/\/$/, "");
      const isDirectory = [...files.keys()].some((known) => known.startsWith(`${target}/`));
      if (!files.has(target) && !isDirectory) {
        findings.push(`dead-link: ${file}: ${link}`);
        continue;
      }
    }
    if (anchor && target.endsWith(".md")) {
      const contents = files.get(target);
      if (contents !== undefined && !headingAnchors(contents).has(anchor.toLowerCase())) {
        findings.push(`dead-anchor: ${file}: ${link}`);
      }
    }
  }
  return findings;
}

/** Tracked files only, so local scratch files never affect the result. */
export function trackedFiles(root: string = REPO_ROOT): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
}

export function repoLinkFindings(root: string = REPO_ROOT): string[] {
  const tracked = trackedFiles(root).filter((f) => existsSync(join(root, f)));
  const files = new Map<string, string | undefined>(
    tracked.map((f) => [f, f.endsWith(".md") ? readText(join(root, f)) : undefined])
  );
  return tracked
    .filter((f) => f.endsWith(".md") && !f.includes("/fixtures/"))
    .flatMap((f) => linkFindings(f, files.get(f)!, files))
    .sort();
}

/* ---------------- app READMEs ---------------- */

/** Each app README lists the workspace packages it depends on, and no packages that do not exist. */
export function readmeFindings(
  app: string,
  readme: string | undefined,
  dependencies: string[],
  workspacePackages: Set<string>
): string[] {
  const internal = dependencies.filter((dep) => workspacePackages.has(dep));
  if (internal.length === 0) return [];
  if (readme === undefined) return [`readme-missing: ${app}`];
  const mentioned = new Set([...readme.matchAll(/@tutors\/[\w-]+/g)].map((m) => m[0]));
  return [
    ...internal.filter((dep) => !mentioned.has(dep)).map((dep) => `readme-unlisted-package: ${app}: ${dep}`),
    ...[...mentioned].filter((name) => !workspacePackages.has(name)).map((name) => `readme-unknown-package: ${app}: ${name}`)
  ].sort();
}

export function workspacePackageNames(root: string = REPO_ROOT): Set<string> {
  const names = new Set<string>();
  for (const file of trackedFiles(root).filter((f) => /^(apps|packages)\/.*package\.json$/.test(f) || /^packages\/jsr\/[^/]+\/deno\.json$/.test(f))) {
    if (file.includes("/node_modules/") || file.includes("/fixtures/")) continue;
    const name = JSON.parse(readText(join(root, file))).name;
    if (typeof name === "string") names.add(name);
  }
  return names;
}

export function repoReadmeFindings(root: string = REPO_ROOT): string[] {
  const workspace = workspacePackageNames(root);
  return readdirSync(join(root, "apps"))
    .filter((app) => existsSync(join(root, "apps", app, "package.json")))
    .flatMap((app) => {
      const manifest = JSON.parse(readText(join(root, "apps", app, "package.json")));
      const deps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
      const readmePath = join(root, "apps", app, "README.md");
      return readmeFindings(`apps/${app}`, existsSync(readmePath) ? readText(readmePath) : undefined, deps, workspace);
    })
    .sort();
}

export const THEMES_DIR = "packages/svelte/themes/src";
