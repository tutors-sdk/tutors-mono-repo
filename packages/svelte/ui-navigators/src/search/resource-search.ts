import type { Lo } from "@tutors/tutors-model-lib";

export type ResourceResult = { lo: Lo; href: string; excerpt: string; score: number };

/** The distinct words of a query, lower-cased. A result must contain every one of them. */
export function searchTerms(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase().split(/\s+/).filter(Boolean))];
}

/** A case-insensitive pattern for any of the words, longest first so "arrays" wins over "array". */
export function termsPattern(terms: string[]): RegExp | null {
  if (!terms.length) return null;
  const escaped = [...terms].sort((a, b) => b.length - a.length).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("|"), "gi");
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, " ");

/**
 * How well a learning object matches, or null when it lacks a word. Each word scores by where it is found:
 * the resource's title 100, its summary 10, its text 1, so title matches rank above summary matches above text
 * matches; the whole phrase earns a bonus in the same order, so words together outrank words apart. A lab
 * step is scored for its lab: the lab's title is the title, and the step's own title counts as summary (it is
 * a heading inside the lab, not the lab's name).
 */
function scoreOf(lo: Lo, terms: string[], resource: Lo): number | null {
  if (!terms.length) return 0;
  const title = (resource.title ?? "").toLocaleLowerCase();
  const summary = stripTags(`${lo.summary ?? ""} ${lo === resource ? "" : lo.title ?? ""}`).toLocaleLowerCase();
  const body = (lo.contentMd ?? "").toLocaleLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 100;
    else if (summary.includes(term)) score += 10;
    else if (body.includes(term)) score += 1;
    else return null;
  }
  const phrase = terms.join(" ");
  if (terms.length > 1) score += title.includes(phrase) ? 50 : summary.includes(phrase) ? 5 : body.includes(phrase) ? 1 : 0;
  return score;
}

/** The line to show under a result: the one holding the whole phrase, else the one holding the most words. */
function excerptOf(body: string, terms: string[]): string {
  if (!terms.length || !body) return "";
  const phrase = terms.join(" ");
  let best = "";
  let bestHits = 0;
  for (const line of body.split("\n")) {
    const lower = line.toLocaleLowerCase();
    const hits = lower.includes(phrase) ? terms.length + 1 : terms.filter(term => lower.includes(term)).length;
    if (hits > bestHits) [best, bestHits] = [line, hits];
    if (hits > terms.length) break;
  }
  return best.replace(/^\s*(#{1,6}|[-*+>]|\d+\.)\s+/, "").replace(/\*\*|`/g, "").slice(0, 280);
}

/**
 * Search titles, summaries and authored text. A resource matches when it holds every word of the query, in any
 * order; a lab step's match counts for its lab and links to the step. Results are ranked by score (see scoreOf)
 * and otherwise keep course order.
 */
export function findResources(los: Lo[], query: string, type: string, visible: (lo: Lo) => boolean): ResourceResult[] {
  const terms = searchTerms(query);
  const results = new Map<string, ResourceResult & { order: number }>();
  let order = 0;
  function visit(nodes: Lo[], parentLab?: Lo) {
    for (const lo of nodes) {
      if (!visible(lo)) continue;
      const resource = lo.type === "step" && parentLab ? parentLab : lo;
      if (!["unit", "side", "course"].includes(lo.type) && (!type || resource.type === type)) {
        const score = scoreOf(lo, terms, resource);
        const known = results.get(resource.route);
        if (score !== null && (!known || score > known.score)) {
          results.set(resource.route, { lo: resource, href: lo.route, excerpt: excerptOf(lo.contentMd ?? "", terms), score, order: known?.order ?? order++ });
        }
      }
      const children = (lo as Lo & { los?: Lo[] }).los;
      if (children) visit(children, lo.type === "lab" ? lo : parentLab);
    }
  }
  visit(los);
  return [...results.values()].sort((a, b) => b.score - a.score || a.order - b.order).map(({ order: _, ...result }) => result);
}

/** Split text around case-insensitive occurrences of the query's words so they can be marked without raw HTML. */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const pattern = termsPattern(searchTerms(query));
  if (!pattern) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > from) parts.push({ text: text.slice(from, match.index), match: false });
    parts.push({ text: match[0], match: true });
    from = match.index + match[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

/** A result's link, carrying the query so the page it opens can scroll to and highlight the match. */
export function withHighlight(href: string, query: string): string {
  const words = query.trim();
  if (!words || /^[a-z]+:/i.test(href)) return href;
  return `${href}${href.includes("?") ? "&" : "?"}highlight=${encodeURIComponent(words)}`;
}

/**
 * Highlight every occurrence of the query's words inside root (CSS Custom Highlight API, so the page's DOM is
 * untouched) and scroll the first match in the content (.prose, else anywhere) to the middle of the screen.
 * Returns false when nothing on the page matches.
 */
export function highlightMatches(root: HTMLElement, query: string, behavior: ScrollBehavior = "smooth", onlyIfOffscreen = false): boolean {
  const registry = (globalThis.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights;
  registry?.delete("search");
  const pattern = termsPattern(searchTerms(query));
  if (!pattern) return false;
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest("script, style, dialog") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (const match of node.data.matchAll(pattern)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      ranges.push(range);
    }
  }
  if (!ranges.length) return false;
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (registry && HighlightCtor) registry.set("search", new HighlightCtor(...ranges));
  const first = ranges.find(range => range.startContainer.parentElement?.closest(".prose")) ?? ranges[0];
  const box = first.getBoundingClientRect();
  if (!onlyIfOffscreen || box.top < 0 || box.bottom > innerHeight) first.startContainer.parentElement?.scrollIntoView({ block: "center", behavior });
  return true;
}

/**
 * Highlight the query's words and scroll to the first match, then again as the page settles: diagrams and other
 * late-rendered content push the match down after the first scroll. It stops as soon as the reader scrolls, taps
 * or presses a key, so it never pulls them back.
 */
export function revealMatches(root: HTMLElement, query: string, behavior: ScrollBehavior = "smooth"): void {
  highlightMatches(root, query, behavior);
  if (!searchTerms(query).length) return;
  const events = ["wheel", "touchmove", "pointerdown", "keydown"];
  let stopped = false;
  const stop = () => (stopped = true);
  events.forEach(event => addEventListener(event, stop, { passive: true }));
  for (const delay of [300, 800, 1600]) setTimeout(() => { if (!stopped) highlightMatches(root, query, "auto", true); }, delay);
  setTimeout(() => events.forEach(event => removeEventListener(event, stop)), 1700);
}
