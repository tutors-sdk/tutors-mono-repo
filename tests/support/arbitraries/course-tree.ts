/**
 * fast-check arbitraries for Tutors courses (testing runway tier B).
 *
 * Generates raw course objects in the shape `packages/jsr/gen` emits into
 * tutors.json, before the reader decorates them: routes still carry the
 * `{{COURSEURL}}` placeholder, composites hold `los`, labs hold steps. Shared
 * by the property tests, the generator differential (tier C) and the release
 * harness, so it depends on nothing but fast-check.
 *
 * Generated values are plain JSON. Decoration mutates a course in place, so
 * take a `structuredClone` before handing one to the code under test.
 */
import fc from "fast-check";

/* ---------------- shapes ---------------- */

export const COMPOSITE_TYPES = ["topic", "unit", "side"] as const;

/** Leaf types the generator emits, excluding composites. */
export const LEAF_TYPES = [
  "note",
  "talk",
  "tutorial",
  "lab",
  "archive",
  "web",
  "github",
  "panelnote",
  "paneltalk",
  "panelvideo",
  "podcast",
  "notebook",
  "whiteboard"
] as const;

export type CompositeType = (typeof COMPOSITE_TYPES)[number];
export type LeafType = (typeof LEAF_TYPES)[number];

/** A generator-independent description of one node; `materialiseCourse` turns it into generator JSON. */
export interface LoShape {
  type: CompositeType | LeafType;
  title: string;
  summary: string;
  contentMd: string;
  hide: boolean;
  /** frontMatter.order, which `sortLos` honours. */
  order?: number;
  /** A video id; talks, notes and panel videos can carry one. */
  videoId?: string;
  hasImage: boolean;
  steps: { title: string; contentMd: string }[];
  children: LoShape[];
}

export interface CourseShape {
  title: string;
  summary: string;
  contentMd: string;
  children: LoShape[];
}

export interface CourseArbitraryOptions {
  /** Composite nesting below the course (1 = topics hold only leaves). Default 3. */
  maxDepth?: number;
  /** Children per composite. Default 0..4. */
  minChildren?: number;
  maxChildren?: number;
  /** Top-level children of the course. Default 1..4. */
  minTopLevel?: number;
  maxTopLevel?: number;
  /** Leaf types to draw from. Default: all of LEAF_TYPES. */
  leafTypes?: readonly LeafType[];
  /** Composite types allowed below the course. Default: topic, unit, side. */
  compositeTypes?: readonly CompositeType[];
  /** Probability-ish weight of hidden los (0 disables). Default 1 in 8. */
  hiddenWeight?: number;
}

/* ---------------- building blocks ---------------- */

/** Any Unicode text, including emoji, combining marks and right-to-left scripts. */
export const unicodeTitle: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: "grapheme", minLength: 0, maxLength: 24 }),
  fc.constantFrom("Introduction", "Café & Crème", "Урок 1", "第一章", "مقدمة", "👩‍💻 Labs", "Ångström #2", "  padded  ")
);

/** Markdown fragments the reader actually meets: headings, prose, fences, images, lists, maths. */
export const markdownLine: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: "grapheme", maxLength: 60 }),
  unicodeTitle.map((t) => `# ${t}`),
  unicodeTitle.map((t) => `## ${t}`),
  fc.constantFrom(
    "![diagram](img/diagram.png)",
    "![local](./img/local.png)",
    "[download](archives/code.zip)",
    "- one\n- two\n- three",
    "```js\nconsole.log('hi');\n```",
    "~~~bash\nnpm install\n~~~",
    "The area is $a^2$.",
    "> quoted",
    "| a | b |\n|---|---|\n| 1 | 2 |",
    ""
  )
);

export const markdown: fc.Arbitrary<string> = fc.array(markdownLine, { maxLength: 6 }).map((lines) => lines.join("\n\n"));

/** Netlify-style course ids, including real-looking ones that contain words the reader rewrites. */
export const courseIdArbitrary: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/) },
  { weight: 1, arbitrary: fc.constantFrom("cs101", "topics-in-ai", "web-topics-2026", "course-design", "unit-testing") }
);

const videoIdArbitrary = fc.stringMatching(/^[A-Za-z0-9_-]{6,11}$/);

const stepArbitrary = fc.record({ title: unicodeTitle, contentMd: markdown });

function leafShape(options: Required<CourseArbitraryOptions>): fc.Arbitrary<LoShape> {
  return fc.record({
    type: fc.constantFrom(...options.leafTypes),
    title: unicodeTitle,
    summary: markdown,
    contentMd: markdown,
    hide: hiddenArbitrary(options),
    order: fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
    videoId: fc.option(videoIdArbitrary, { nil: undefined, freq: 3 }),
    hasImage: fc.boolean(),
    steps: fc.array(stepArbitrary, { maxLength: 4 }),
    children: fc.constant([] as LoShape[])
  });
}

function hiddenArbitrary(options: Required<CourseArbitraryOptions>): fc.Arbitrary<boolean> {
  if (options.hiddenWeight <= 0) return fc.constant(false);
  return fc.oneof({ weight: options.hiddenWeight, arbitrary: fc.constant(true) }, { weight: 8 - options.hiddenWeight, arbitrary: fc.constant(false) });
}

function nodeShape(options: Required<CourseArbitraryOptions>, depth: number): fc.Arbitrary<LoShape> {
  const leaf = leafShape(options);
  if (depth >= options.maxDepth || options.compositeTypes.length === 0) return leaf;
  const composite: fc.Arbitrary<LoShape> = fc.record({
    type: fc.constantFrom(...options.compositeTypes),
    title: unicodeTitle,
    summary: markdown,
    contentMd: markdown,
    hide: hiddenArbitrary(options),
    order: fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
    videoId: fc.constant(undefined),
    hasImage: fc.boolean(),
    steps: fc.constant([]),
    children: fc.array(nodeShape(options, depth + 1), { minLength: options.minChildren, maxLength: options.maxChildren })
  });
  return fc.oneof({ weight: 3, arbitrary: leaf }, { weight: 2, arbitrary: composite });
}

function withDefaults(options: CourseArbitraryOptions): Required<CourseArbitraryOptions> {
  return {
    maxDepth: options.maxDepth ?? 3,
    minChildren: options.minChildren ?? 0,
    maxChildren: options.maxChildren ?? 4,
    minTopLevel: options.minTopLevel ?? 1,
    maxTopLevel: options.maxTopLevel ?? 4,
    leafTypes: options.leafTypes ?? LEAF_TYPES,
    compositeTypes: options.compositeTypes ?? COMPOSITE_TYPES,
    hiddenWeight: options.hiddenWeight ?? 1
  };
}

export function courseShapeArbitrary(options: CourseArbitraryOptions = {}): fc.Arbitrary<CourseShape> {
  const resolved = withDefaults(options);
  return fc.record({
    title: unicodeTitle,
    summary: markdown,
    contentMd: markdown,
    children: fc.array(nodeShape(resolved, 1), { minLength: resolved.minTopLevel, maxLength: resolved.maxTopLevel })
  });
}

/* ---------------- materialising generator JSON ---------------- */

// Loose on purpose: this is generator output, not the decorated model types.
export type RawLo = Record<string, unknown> & { type: string; route: string; los?: RawLo[] };
export type RawCourse = RawLo & { type: "course"; los: RawLo[]; properties: Record<string, unknown> };

/** Folder names are unique among siblings, as they are on disk. */
function segment(shape: LoShape, index: number): string {
  return `${shape.type}-${index}`;
}

function baseLo(shape: LoShape, path: string): RawLo {
  const id = path.slice(path.lastIndexOf("/") + 1);
  const lo: RawLo = {
    type: shape.type,
    id,
    title: shape.title,
    summary: shape.summary,
    contentMd: shape.contentMd,
    frontMatter: shape.order === undefined ? {} : { order: shape.order },
    route: `/${shape.type}/{{COURSEURL}}${path}`,
    authLevel: 0,
    img: shape.hasImage ? `https://{{COURSEURL}}${path}/${id}.png` : "",
    imgFile: shape.hasImage ? `${id}.png` : "",
    video: "",
    videoids: { videoid: "", videoIds: [] },
    hide: shape.hide
  };
  if (shape.videoId) {
    lo.video = `/video/{{COURSEURL}}${path}/${shape.videoId}`;
    lo.videoids = { videoid: shape.videoId, videoIds: [{ service: "youtube", id: shape.videoId }] };
  }
  return lo;
}

function materialiseLo(shape: LoShape, path: string): RawLo {
  const lo = baseLo(shape, path);
  switch (shape.type) {
    case "topic":
    case "unit":
    case "side":
      lo.los = shape.children.map((child, i) => materialiseLo(child, `${path}/${segment(child, i)}`));
      break;
    case "lab":
      lo.contentMd = "";
      lo.pdf = "";
      lo.pdfFile = "";
      lo.los = shape.steps.map((step, i) => ({
        type: "step",
        id: `${i}`,
        title: step.title,
        shortTitle: `${i}`,
        contentMd: step.contentMd,
        route: `${lo.route}/${i}`
      }));
      break;
    case "talk":
    case "paneltalk":
    case "tutorial":
      lo.pdf = `https://{{COURSEURL}}${path}/${lo.id}.pdf`;
      lo.pdfFile = `${lo.id}.pdf`;
      break;
    case "archive":
      lo.contentMd = "";
      lo.archiveFile = `${lo.id}.zip`;
      break;
    case "web":
      lo.contentMd = "";
      lo.route = `https://example.com${path}`;
      break;
    case "github":
      lo.contentMd = "";
      lo.route = `https://github.com/tutors-sdk${path}`;
      break;
    case "panelvideo":
      // The generator routes a panel video to its video.
      if (!shape.videoId) lo.video = `/video/{{COURSEURL}}${path}/${lo.id}`;
      lo.route = lo.video as string;
      break;
    case "podcast":
      lo.episode = { title: shape.title, url: `https://podcasts.example.com${path}.mp3` };
      break;
    case "notebook":
      lo.cells = [];
      lo.kernelLanguage = "python";
      lo.kernelName = "Python 3";
      break;
    case "whiteboard":
      lo.excalidraw = `https://{{COURSEURL}}${path}/${lo.id}.excalidraw`;
      lo.excalidrawFile = `${lo.id}.excalidraw`;
      break;
  }
  return lo;
}

export function materialiseCourse(shape: CourseShape): RawCourse {
  return {
    type: "course",
    id: "course",
    title: shape.title,
    summary: shape.summary,
    contentMd: shape.contentMd,
    frontMatter: {},
    route: "/course/{{COURSEURL}}",
    authLevel: 0,
    img: "https://{{COURSEURL}}/course.png",
    imgFile: "course.png",
    video: "",
    videoids: { videoid: "", videoIds: [] },
    hide: false,
    properties: { credits: "Tutors test fixture" },
    los: shape.children.map((child, i) => materialiseLo(child, `/${segment(child, i)}`))
  };
}

/** Raw generator JSON for a whole course. */
export function courseArbitrary(options: CourseArbitraryOptions = {}): fc.Arbitrary<RawCourse> {
  return courseShapeArbitrary(options).map(materialiseCourse);
}

/* ---------------- helpers for properties ---------------- */

/** Every node below `root`, depth first, with its container. Lab steps are included. */
export function walkRaw(root: RawLo): { lo: RawLo; parent: RawLo; depth: number }[] {
  const out: { lo: RawLo; parent: RawLo; depth: number }[] = [];
  const visit = (parent: RawLo, depth: number) => {
    for (const lo of parent.los ?? []) {
      out.push({ lo, parent, depth });
      visit(lo, depth + 1);
    }
  };
  visit(root, 1);
  return out;
}

/** Run count and replay settings shared by property suites: FUZZ_RUNS, and FUZZ_SEED plus FUZZ_PATH to replay a failure. */
export function fuzzParameters(defaultRuns = 100): fc.Parameters<unknown> {
  const params: fc.Parameters<unknown> = { numRuns: Number(process.env.FUZZ_RUNS) || defaultRuns };
  if (process.env.FUZZ_SEED) {
    params.seed = Number(process.env.FUZZ_SEED);
    if (process.env.FUZZ_PATH) params.path = process.env.FUZZ_PATH;
  }
  return params;
}
