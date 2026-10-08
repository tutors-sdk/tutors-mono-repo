/**
 * The tutors.json file: what the `tutors` generator writes and the reader fetches.
 *
 * This is the file on disk, before the reader decorates it. model-lib's `Course` is the decorated
 * object (courseId, courseUrl, isPortfolio, the indexes and walls are added by `decorateCourseTree`),
 * so it cannot describe the file. `TUTORS_JSON_SCHEMA` is the contract: the generator differential
 * validates every corpus course against it (Rule 0262) and the release harness can validate captured
 * live courses against the same schema, published as tutors-json.schema.json beside this package.
 *
 * The schema is strict for learning objects (`unevaluatedProperties: false`), so a generator change
 * that adds, drops or renames a field fails until this file says so. Author-written YAML and
 * front matter (properties, calendar, enrollment, frontMatter) stay open.
 *
 * Plain data only: no imports from outside the package (Rule 0130), so validators are the caller's
 * choice. The mono-repo uses Ajv's draft 2020-12 build.
 */
import { LO_SIMPLE_TYPES } from "./learning-objects.ts";

/** Video ids read from a learning object's `videoid` file. */
export type TutorsJsonVideoIds = {
  videoid: string;
  videoIds: { service: string; id: string; url?: string; externalUrl?: string }[];
};

/** A lab step, one per markdown file in a lab folder. */
export type TutorsJsonStep = {
  type: "step";
  id: string;
  title: string;
  shortTitle: string;
  contentMd: string;
  route: string;
};

/** Fields every learning object in tutors.json carries. */
export type TutorsJsonLoBase = {
  type: string;
  id: string;
  title: string;
  summary: string;
  contentMd: string;
  frontMatter: Record<string, unknown>;
  route: string;
  img: string;
  imgFile: string;
  video: string;
  videoids: TutorsJsonVideoIds;
  hide: boolean;
  authLevel: number;
};

export type TutorsJsonNotebookCell = {
  cellType: "markdown" | "code" | "raw";
  source: string;
  outputs: {
    outputType: "stream" | "execute_result" | "display_data" | "error";
    text?: string;
    data?: Record<string, string>;
    traceback?: string[];
    name?: string;
    executionCount?: number | null;
  }[];
  executionCount: number | null;
  metadata: Record<string, unknown>;
  id: string;
};

/** A learning object below the course, with the fields its kind adds. */
export type TutorsJsonLo = TutorsJsonLoBase & {
  los?: (TutorsJsonLo | TutorsJsonStep)[];
  pdf?: string;
  pdfFile?: string;
  archiveFile?: string;
  episode?: { service: string; id: string };
  cells?: TutorsJsonNotebookCell[];
  kernelLanguage?: string;
  kernelName?: string;
  excalidraw?: string;
  excalidrawFile?: string;
};

/** The root of tutors.json. */
export type TutorsJsonCourse = TutorsJsonLoBase & {
  type: "course";
  route: "/";
  los: TutorsJsonLo[];
  properties?: Record<string, unknown>;
  calendar?: Record<string, unknown>;
  enrollment?: Record<string, unknown>;
};

const string = { type: "string" } as const;
const openObject = { type: "object" } as const;
const stringFields = (...names: string[]) => Object.fromEntries(names.map((name) => [name, string]));

/** Learning-object kinds that may appear below the course. */
const CHILD_TYPES = [...LO_SIMPLE_TYPES, "unit", "side", "topic"] as const;

/** JSON Schema (draft 2020-12) for tutors.json as the generator writes it. */
export const TUTORS_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:tutors:tutors-json",
  title: "tutors.json",
  description: "A Tutors course as written by the tutors generator, before the reader decorates it.",
  $ref: "#/$defs/course",
  $defs: {
    videoIds: {
      type: "object",
      required: ["videoid", "videoIds"],
      additionalProperties: false,
      properties: {
        videoid: string,
        videoIds: {
          type: "array",
          items: {
            type: "object",
            required: ["service", "id"],
            additionalProperties: false,
            properties: stringFields("service", "id", "url", "externalUrl")
          }
        }
      }
    },
    loBase: {
      type: "object",
      required: ["type", "id", "title", "summary", "contentMd", "frontMatter", "route", "img", "imgFile", "video", "videoids", "hide", "authLevel"],
      properties: {
        ...stringFields("type", "id", "title", "summary", "contentMd", "route", "img", "imgFile", "video"),
        frontMatter: openObject,
        videoids: { $ref: "#/$defs/videoIds" },
        hide: { type: "boolean" },
        authLevel: { type: "number" }
      }
    },
    step: {
      type: "object",
      required: ["type", "id", "title", "shortTitle", "contentMd", "route"],
      additionalProperties: false,
      properties: { type: { const: "step" }, ...stringFields("id", "title", "shortTitle", "contentMd", "route") }
    },
    notebookCell: {
      type: "object",
      required: ["cellType", "source", "outputs", "executionCount", "metadata", "id"],
      additionalProperties: false,
      properties: {
        cellType: { enum: ["markdown", "code", "raw"] },
        source: string,
        outputs: {
          type: "array",
          items: {
            type: "object",
            required: ["outputType"],
            additionalProperties: false,
            properties: {
              outputType: { enum: ["stream", "execute_result", "display_data", "error"] },
              text: string,
              data: { type: "object", additionalProperties: string },
              traceback: { type: "array", items: string },
              name: string,
              executionCount: { type: ["number", "null"] }
            }
          }
        },
        executionCount: { type: ["number", "null"] },
        metadata: openObject,
        id: string
      }
    },
    lo: {
      allOf: [
        { $ref: "#/$defs/loBase" },
        { properties: { type: { enum: CHILD_TYPES } } },
        {
          if: { properties: { type: { enum: ["topic", "unit", "side"] } } },
          then: { required: ["los"], properties: { los: { type: "array", items: { $ref: "#/$defs/lo" } } } }
        },
        {
          if: { properties: { type: { const: "lab" } } },
          then: { required: ["los"], properties: { los: { type: "array", items: { $ref: "#/$defs/step" } }, ...stringFields("pdf", "pdfFile") } }
        },
        {
          if: { properties: { type: { enum: ["talk", "paneltalk", "tutorial"] } } },
          then: { required: ["pdf", "pdfFile"], properties: stringFields("pdf", "pdfFile") }
        },
        {
          if: { properties: { type: { const: "archive" } } },
          then: { required: ["archiveFile"], properties: stringFields("archiveFile") }
        },
        {
          if: { properties: { type: { const: "podcast" } } },
          then: {
            required: ["episode"],
            properties: { episode: { type: "object", required: ["service", "id"], additionalProperties: false, properties: stringFields("service", "id") } }
          }
        },
        {
          if: { properties: { type: { const: "notebook" } } },
          then: { properties: { cells: { type: "array", items: { $ref: "#/$defs/notebookCell" } }, ...stringFields("kernelLanguage", "kernelName") } }
        },
        {
          if: { properties: { type: { const: "whiteboard" } } },
          then: { properties: stringFields("excalidraw", "excalidrawFile") }
        }
      ],
      unevaluatedProperties: false
    },
    course: {
      allOf: [{ $ref: "#/$defs/loBase" }],
      required: ["los"],
      properties: {
        type: { const: "course" },
        route: { const: "/" },
        los: { type: "array", items: { $ref: "#/$defs/lo" } },
        properties: openObject,
        calendar: openObject,
        enrollment: openObject
      },
      unevaluatedProperties: false
    }
  }
} as const;
