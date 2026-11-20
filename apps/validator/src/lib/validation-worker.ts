import { checkZip } from "@tutors/course/validation";
import { validatePublishedCourse } from "./published";
import type { DiagramCheck, Finding } from "@tutors/course-rules";

let answerDiagram: ((result: DiagramCheck) => void) | undefined;
self.onmessage = async ({ data }: MessageEvent<{ bytes: Uint8Array } | { course: unknown } | { diagramResult: DiagramCheck }>) => {
  if ("diagramResult" in data) {
    answerDiagram?.(data.diagramResult);
    return;
  }
  try {
    let unchecked = 0;
    const findings: Finding[] =
      "bytes" in data
        ? await checkZip(data.bytes, {
            diagrams: {
              mermaid: (source) =>
                new Promise((resolve) => {
                  answerDiagram = (result) => {
                    if (result.draws === "unknown") unchecked++;
                    resolve(result);
                  };
                  self.postMessage({ diagram: source });
                })
            }
          })
        : validatePublishedCourse(data.course);
    if (unchecked)
      findings.push({ rule: "V017", severity: "warn", path: "", message: `${unchecked} Mermaid diagram(s) could not be checked. Review these in the reader before publishing.` });
    self.postMessage({ findings });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "This course could not be checked. Please try again." });
  }
};
