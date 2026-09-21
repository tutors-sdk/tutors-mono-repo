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
          const excerpt = term ? body.split("\n").find(line => line.toLocaleLowerCase().includes(term)) ?? "" : "";
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
