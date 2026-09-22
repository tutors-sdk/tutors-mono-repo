import type { Lo } from "@tutors/tutors-model-lib";

export type ResourceResult = { lo: Lo; href: string; excerpt: string };

/** Search eligible metadata and authored text, grouping step hits under their parent lab. */
export function findResources(los: Lo[], query: string, type: string, visible: (lo: Lo) => boolean): ResourceResult[] {
  const results = new Map<string, ResourceResult>();
  const term = query.trim().toLocaleLowerCase();
  function visit(nodes: Lo[], parentLab?: Lo) {
    for (const lo of nodes) {
      if (!visible(lo)) continue;
      const resource = lo.type === "step" && parentLab ? parentLab : lo;
      const metadata = `${lo.title ?? ""} ${lo.summary ?? ""}`.replace(/<[^>]*>/g, " ");
      const body = lo.contentMd ?? "";
      if (!["unit", "side", "course"].includes(lo.type) && (!type || resource.type === type) &&
          (!term || `${metadata} ${body}`.toLocaleLowerCase().includes(term))) {
        const key = resource.route;
        if (!results.has(key)) {
          const line = term ? body.split("\n").find(line => line.toLocaleLowerCase().includes(term)) ?? "" : "";
          const excerpt = line.replace(/^\s*(#{1,6}|[-*+>]|\d+\.)\s+/, "").replace(/\*\*|`/g, "");
          results.set(key, { lo: resource, href: lo.route, excerpt: excerpt.slice(0, 280) });
        }
      }
      const children = (lo as Lo & { los?: Lo[] }).los;
      if (children) visit(children, lo.type === "lab" ? lo : parentLab);
    }
  }
  visit(los);
  return [...results.values()];
}

/** Split text around case-insensitive occurrences of query so matches can be marked without raw HTML. */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [{ text, match: false }];
  const lower = text.toLocaleLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + term.length), match: true });
    from = at + term.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}
