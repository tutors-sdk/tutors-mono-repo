import type { DiagramCheck, DiagramPort } from "../ports.ts";

/** The one Mermaid call the checker needs, so course-rules never imports Mermaid itself. */
export interface MermaidParser {
  parse(text: string): Promise<unknown>;
}

interface MermaidParseError {
  hash: { loc: { first_line: number } };
}

const isParseError = (error: unknown): error is MermaidParseError =>
  typeof error === "object" && error !== null && typeof (error as MermaidParseError).hash?.loc?.first_line === "number";

/**
 * A DiagramPort over the Mermaid the shell already loads (`(await import("mermaid")).default`). A parse
 * error names the diagram line it stopped at; an unknown first line is reported as such; anything else
 * (a diagram type that needs a browser, say) is "unknown", so a shell without a DOM never reports a
 * diagram as broken when it is not.
 */
export function mermaidDiagrams(mermaid: MermaidParser): DiagramPort {
  return {
    async mermaid(source: string): Promise<DiagramCheck> {
      try {
        await mermaid.parse(source);
        return { draws: true };
      } catch (error: unknown) {
        if (isParseError(error)) return { draws: false, line: error.hash.loc.first_line };
        if (error instanceof Error && error.name === "UnknownDiagramError") return { draws: false, unknownType: true };
        return { draws: "unknown" };
      }
    }
  };
}
