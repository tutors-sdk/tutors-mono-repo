import frontMatterModule from "front-matter";
const frontMatter = frontMatterModule.default || frontMatterModule;

import {
  getArchiveFile,
  getFilesWithType,
  getFileWithName,
  getGitLink,
  getId,
  getImage,
  getImageFile,
  getLabImage,
  getLabImageFile,
  getMarkdown,
  getPdf,
  getPdfFile,
  getPodcastEpisode,
  getRoute,
  getVideo,
  getWebLink,
  readVideoIds,
  removeLeadingHashes,
} from "../utils/lr-utils.ts";
import {
  type Archive,
  type Composite,
  type Course,
  isCompositeLo,
  type Lab,
  type Lo,
  type Notebook,
  type NotebookCell,
  type NotebookOutput,
  type Playground,
  type PlaygroundFile,
  type PlaygroundRuntime,
  Podcast,
  preOrder,
  Properties,
  type Scorm,
  type Talk,
  Tutorial,
  type Whiteboard,
} from "@tutors/tutors-model-lib";
import { getFileName, getFileType, readWholeFile, readYamlFile } from "../utils/file-utils.ts";
import { readScormPackage, SCORM_CONTENT_FOLDER } from "../scorm/package.ts";
import type { LearningResource } from "../types/types.ts";

let silentGlobal = false;

function buildTalk(lo: Lo, lr: LearningResource) {
  const talk = lo as Talk;
  talk.pdf = getPdf(lr);
  talk.pdfFile = getPdfFile(lr);
  if (!talk.pdf && lo.video) {
    talk.route = lo.video;
  }
  const marpFiles = getFilesWithType(lr, "marp");
  if (marpFiles.length > 0) {
    const contents = frontMatter(readWholeFile(marpFiles[0]));
    lo.contentMd = contents.body;
    lo.frontMatter = {
      ...(contents.attributes as Properties),
      ...lo.frontMatter,
    };
  }
}

function buildTutorial(lo: Lo, lr: LearningResource) {
  const tutorial = lo as Tutorial;
  tutorial.pdf = getPdf(lr);
  tutorial.pdfFile = getPdfFile(lr);
}

function buildArchive(lo: Lo, lr: LearningResource) {
  const archive = lo as Archive;
  archive.archiveFile = getArchiveFile(lr);
}

function buildPanelvideo(lo: Lo) {
  lo.route = lo.video;
}

function buildWeb(lo: Lo, lr: LearningResource) {
  lo.route = getWebLink(lr);
}

function buildPodcast(lo: Lo, lr: LearningResource) {
  const podcast = lo as Podcast;
  podcast.episode = getPodcastEpisode(lr);
}

function buildGithub(lo: Lo, lr: LearningResource) {
  lo.route = getGitLink(lr);
}

function buildLab(lo: Lo, lr: LearningResource): Lo {
  const lab = lo as Lab;
  lab.los = [];
  const mdFiles = getFilesWithType(lr, "md");
  const title = lo.title;
  lo.title = "";
  mdFiles.forEach((chapterName) => {
    const wholeFile = readWholeFile(chapterName);
    const contents = frontMatter(wholeFile);
    let theTitle = contents.body.substring(0, contents.body.indexOf("\n"));
    theTitle = theTitle.replace("\r", "");
    theTitle = removeLeadingHashes(theTitle);
    const shortTitle = chapterName.substring(
      chapterName.indexOf(".") + 1,
      chapterName.lastIndexOf("."),
    );
    if (lab.title == "") lab.title = shortTitle;
    const labStep = {
      title: theTitle,
      shortTitle: shortTitle,
      contentMd: contents.body,
      route: `${getRoute(lr)}/${shortTitle}`,
      id: shortTitle,
      type: "step",
    };
    lab.los.push(labStep);
  });
  lab.img = getLabImage(lr);
  lab.imgFile = `img/${getLabImageFile(lr)}`;
  if (!lab.img) {
    lab.img = getImage(lr);
    lab.imgFile = getImageFile(lr);
    lab.title = title;
    lab.pdf = getPdf(lr);
    lab.pdfFile = getPdfFile(lr);
  }
  return lo;
}

function buildNotebook(lo: Lo, lr: LearningResource) {
  const notebook = lo as Notebook;
  const ipynbFiles = getFilesWithType(lr, "ipynb");
  if (ipynbFiles.length === 0) return;

  const ipynbContent = readWholeFile(ipynbFiles[0]);
  const nb = JSON.parse(ipynbContent);

  notebook.kernelLanguage = nb.metadata?.kernelspec?.language || nb.metadata?.language_info?.name || "python";
  notebook.kernelName = nb.metadata?.kernelspec?.display_name || notebook.kernelLanguage;

  notebook.cells = (nb.cells || []).map((cell: any, index: number): NotebookCell => {
    const source = Array.isArray(cell.source) ? cell.source.join("") : (cell.source || "");
    const outputs: NotebookOutput[] = (cell.outputs || []).map((output: any): NotebookOutput => {
      const result: NotebookOutput = {
        outputType: output.output_type as NotebookOutput["outputType"],
      };
      if (output.name) result.name = output.name;
      if (output.execution_count != null) result.executionCount = output.execution_count;
      if (output.text) {
        result.text = Array.isArray(output.text) ? output.text.join("") : output.text;
      }
      if (output.traceback) {
        result.traceback = output.traceback;
      }
      if (output.data) {
        const data: Record<string, string> = {};
        for (const [mime, content] of Object.entries(output.data)) {
          const value = Array.isArray(content) ? (content as string[]).join("") : (content as string);
          data[mime] = value;
        }
        result.data = data;
      }
      return result;
    });

    return {
      cellType: cell.cell_type as NotebookCell["cellType"],
      source,
      outputs,
      executionCount: cell.execution_count ?? null,
      metadata: cell.metadata || {},
      id: cell.id || `cell-${index}`,
    };
  });

  notebook.img = getLabImage(lr);
  notebook.imgFile = `img/${getLabImageFile(lr)}`;
  if (!notebook.img) {
    notebook.img = getImage(lr);
    notebook.imgFile = getImageFile(lr);
  }
}

/** Source file types a playground workspace may contain, and the runtime each one implies. */
const PLAYGROUND_RUNTIMES: Record<string, PlaygroundRuntime> = {
  py: "python",
  js: "javascript",
  mjs: "javascript",
  ts: "typescript",
};

/** Carried into the workspace so the code can read them, but not runnable on their own. */
const PLAYGROUND_DATA_TYPES = ["json", "txt", "csv"];

/** A single runaway file would be inlined into the course tree and downloaded by every student. */
const PLAYGROUND_FILE_LIMIT = 256 * 1024;

function isTestFile(name: string): boolean {
  return /^test[_-]/.test(name) || /[._-]test\.(py|js|mjs|ts)$/.test(name) || /[._-]spec\.(py|js|mjs|ts)$/.test(name);
}

/**
 * Read a `playground-*` folder into an editable workspace.
 *
 * Only the files sitting directly in the folder are part of the workspace. Subfolders are
 * pruned from the course tree before this runs, so a nested file would silently vanish;
 * a flat folder is what an author can actually rely on.
 *
 * Everything is optional. A folder holding one `main.py` is a valid playground — the
 * `playground.yaml` exists for the cases where the defaults guess wrong.
 */
function buildPlayground(lo: Lo, lr: LearningResource) {
  const playground = lo as Playground;
  const config = readPlaygroundConfig(lr);

  const sources = lr.files
    .filter((file) => {
      const type = getFileType(file);
      return type in PLAYGROUND_RUNTIMES || PLAYGROUND_DATA_TYPES.includes(type);
    })
    .map((file) => ({ name: getFileName(file), path: file }));

  const testsName = config.tests ?? sources.find((source) => isTestFile(source.name))?.name;
  const workspace = sources.filter((source) => source.name !== testsName);

  const entry = config.entry ?? pickEntry(workspace.map((source) => source.name));
  playground.entry = entry;
  playground.runtime = config.runtime ?? PLAYGROUND_RUNTIMES[getFileType(entry)] ?? "python";
  playground.packages = config.packages;
  playground.files = workspace
    .map((source) => readPlaygroundFile(source.name, source.path, config.readOnly))
    .filter((file): file is PlaygroundFile => file !== null)
    // The entry point is what the student is asked to work on, so it leads.
    .sort((a, b) => Number(b.path === entry) - Number(a.path === entry));

  const testsPath = testsName ? sources.find((source) => source.name === testsName)?.path : undefined;
  if (testsName && testsPath) {
    const tests = readPlaygroundFile(testsName, testsPath, []);
    if (tests) playground.tests = tests;
  }

  if (playground.files.length === 0) {
    console.log(`No source files found in ${lr.route}. A playground needs at least one .py, .js or .ts file.`);
  }

  playground.img = getLabImage(lr);
  playground.imgFile = `img/${getLabImageFile(lr)}`;
  if (!playground.img) {
    playground.img = getImage(lr);
    playground.imgFile = getImageFile(lr);
  }
}

function readPlaygroundFile(name: string, path: string, readOnly: string[]): PlaygroundFile | null {
  const content = readWholeFile(path);
  if (content.length > PLAYGROUND_FILE_LIMIT) {
    console.log(`${path} is too large to inline in a playground (limit ${PLAYGROUND_FILE_LIMIT} bytes) and was skipped.`);
    return null;
  }
  const file: PlaygroundFile = { path: name, content };
  if (readOnly.includes(name)) file.readOnly = true;
  return file;
}

/** `main.*` is the convention; failing that the first source file is as good a guess as any. */
function pickEntry(names: string[]): string {
  const main = names.find((name) => /^main\.(py|js|mjs|ts)$/.test(name));
  if (main) return main;
  const runnable = names.find((name) => getFileType(name) in PLAYGROUND_RUNTIMES);
  return runnable ?? names[0] ?? "main.py";
}

interface PlaygroundConfig {
  runtime?: PlaygroundRuntime;
  entry?: string;
  tests?: string;
  packages: string[];
  readOnly: string[];
}

function readPlaygroundConfig(lr: LearningResource): PlaygroundConfig {
  const config: PlaygroundConfig = { packages: [], readOnly: [] };
  const configFile = lr.files.find((file) => getFileName(file) === "playground.yaml");
  if (!configFile) return config;

  const yaml = readYamlFile(configFile);
  if (!yaml || typeof yaml !== "object") return config;

  if (typeof yaml.runtime === "string" && ["python", "javascript", "typescript"].includes(yaml.runtime)) {
    config.runtime = yaml.runtime as PlaygroundRuntime;
  }
  if (typeof yaml.entry === "string") config.entry = yaml.entry;
  if (typeof yaml.tests === "string") config.tests = yaml.tests;
  if (Array.isArray(yaml.packages)) {
    config.packages = yaml.packages.filter((name: unknown) => typeof name === "string");
  }
  if (Array.isArray(yaml.readOnly)) {
    config.readOnly = yaml.readOnly.filter((name: unknown) => typeof name === "string");
  }
  return config;
}

function buildWhiteboard(lo: Lo, lr: LearningResource) {
  const whiteboard = lo as Whiteboard;
  const excalidrawFiles = getFilesWithType(lr, "excalidraw");
  if (excalidrawFiles.length > 0) {
    whiteboard.excalidrawFile = excalidrawFiles[0].substring(excalidrawFiles[0].lastIndexOf("/") + 1);
    whiteboard.excalidraw = `https://{{COURSEURL}}${excalidrawFiles[0].replace(lr.courseRoot, "")}`;
  }
}

/**
 * A `scorm-*` folder holds a third-party package rather than Tutors content, so its
 * shape is discovered from its own imsmanifest.xml instead of from naming conventions.
 */
function buildScormLo(lo: Lo, lr: LearningResource) {
  const scorm = lo as Scorm;
  let source;
  try {
    source = readScormPackage(lr.files);
  } catch (error) {
    console.log(`Tutors could not read the SCORM package in ${lr.route}: ${(error as Error).message}`);
    return;
  }
  if (!source) {
    console.log(`No SCORM package found in ${lr.route}. Expected an imsmanifest.xml, or a .zip containing one.`);
    return;
  }
  scorm.scormVersion = source.info.version;
  scorm.scormFile = source.info.launchFile;
  scorm.scorm = `https://{{COURSEURL}}${lr.route.replace(lr.courseRoot, "")}/${SCORM_CONTENT_FOLDER}/${source.info.launchFile}`;
  // Vendor packages usually name themselves; the folder's .md only has to override that.
  if (!scorm.title && source.info.title) {
    scorm.title = source.info.title;
  }
  const masteryScore = Number(lo.frontMatter?.masteryScore);
  if (!isNaN(masteryScore)) {
    scorm.masteryScore = masteryScore;
  }
}

function buildSimpleLo(lo: Lo, lr: LearningResource): Lo {
  switch (lo.type) {
    case "scorm":
      buildScormLo(lo, lr);
      break;
    case "lab":
      buildLab(lo, lr);
      break;
    case "notebook":
      buildNotebook(lo, lr);
      break;
    case "playground":
      buildPlayground(lo, lr);
      break;
    case "whiteboard":
      buildWhiteboard(lo, lr);
      break;
    case "talk":
      buildTalk(lo, lr);
      break;
    case "tutorial":
      buildTutorial(lo, lr);
      break;
    case "paneltalk":
      buildTalk(lo, lr);
      break;
    case "panelvideo":
      buildPanelvideo(lo);
      break;
    case "web":
      buildWeb(lo, lr);
      break;
    case "podcast":
      buildPodcast(lo, lr);
      break;
    case "github":
      buildGithub(lo, lr);
      break;
    case "archive":
      buildArchive(lo, lr);
      break;
    default:
  }
  return lo;
}

function buildUnit(lo: Lo) {
  lo.route = lo.route.substring(0, lo.route.lastIndexOf("/")) + "/";
  lo.route = lo.route.replace("/unit", "/topic");
}

function buildSide(lo: Lo) {
  lo.route = lo.route.substring(0, lo.route.lastIndexOf("/")) + "/";
  lo.route = lo.route.replace("/side", "/topic");
}

function buildCompositeLo(lo: Lo, lr: LearningResource, level: number): Lo {
  const compositeLo = lo as Composite;
  compositeLo.los = [];
  switch (compositeLo.type) {
    case "unit":
      buildUnit(compositeLo);
      break;
    case "side":
      buildSide(compositeLo);
      break;
    default:
  }
  lr.lrs.forEach((lr) => {
    const subLo = buildLo(lr, level + 1);
    if (subLo.type !== "unknown") compositeLo.los.push(subLo);
  });
  compositeLo.los.sort((a: Lo, b: Lo) => {
    const aOrder = preOrder.get(a.type) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = preOrder.get(b.type) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
  return lo;
}

function buildDefaultLo(lr: LearningResource, keyFileName: string = ""): Lo {
  const [title, summary, contentMd, frontMatter] = getMarkdown(lr, keyFileName);
  const videoids = readVideoIds(lr);
  const lo: Lo = {
    route: getRoute(lr),
    type: lr.type,
    title: title,
    summary: summary,
    contentMd: contentMd,
    frontMatter: frontMatter,
    id: getId(lr),
    img: getImage(lr),
    imgFile: getImageFile(lr),
    video: getVideo(lr, videoids.videoid),
    videoids: videoids,
    hide: false,
    authLevel: 0,
  };
  return lo;
}

function buildLo(
  lr: LearningResource,
  level: number,
  keyFileName: string = "",
): Lo {
  let lo = buildDefaultLo(lr, keyFileName);
  if (!silentGlobal) console.log(`${"-".repeat(level * 2)}: ${lo.id} : ${lo.title}`);
  if (isCompositeLo(lo)) {
    lo = buildCompositeLo(lo, lr, level);
  } else {
    lo = buildSimpleLo(lo, lr);
  }
  return lo;
}

export function buildCourse(lr: LearningResource, silent: boolean = false): Course {
  silentGlobal = silent;
  const course = buildLo(lr, 0, "course.md") as Course;
  course.type = "course";
  course.route = "/";
  const propertiesFile = getFileWithName(lr, "properties.yaml");
  if (propertiesFile) {
    course.properties = readYamlFile(propertiesFile);
    const ignoreList = course.properties?.ignore;
    if (ignoreList) {
      const los = course.los.filter((lo) => ignoreList.indexOf(lo.id) >= 0);
      los.forEach((lo) => {
        if ("type" in lo) lo.hide = true;
      });
    }
  }
  const calendarFile = getFileWithName(lr, "calendar.yaml");
  if (calendarFile) {
    course.calendar = readYamlFile(calendarFile);
  }

  const enrollmentFile = getFileWithName(lr, "enrollment.yaml");
  if (enrollmentFile) {
    course.enrollment = readYamlFile(enrollmentFile);
  }

  return course;
}
