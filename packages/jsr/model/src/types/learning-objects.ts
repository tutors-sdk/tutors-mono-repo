/**
 * Composite learning object types
 */

import type { Calendar, Enrollment } from "./calendar-types.ts";
import type { PodcastEpisodeIdentifier, VideoIdentifiers } from "./media-types.ts";
import type { LearningRecord, Properties } from "./type-utils.ts";
import type { IconNavBar, IconType } from "./icon-types.ts";

/**
 * Core learning object type
 * Represents any content unit in the Tutors system
 */
export type Lo = {
  type: string;
  id: string;
  title: string;
  summary: string;
  contentMd: string;
  frontMatter: Properties;
  contentHtml?: string;
  route: string;
  authLevel: number;

  img: string;
  imgFile: string;
  icon?: IconType;

  video: string;
  videoids: VideoIdentifiers;

  hide: boolean;

  parentLo?: Lo;
  parentTopic?: Topic;
  parentCourse?: Course;
  breadCrumbs?: Lo[];

  learningRecords?: Map<string, LearningRecord>;
};

/**
 * Lab step definition
 * Represents a single step in a lab
 */
export type LabStep = {
  title: string;
  shortTitle: string;
  contentMd: string;
  contentHtml?: string;
  route: string;
  id: string;
  parentLo?: Lab;
  type: string;
};

/**
 * Lab learning object
 * Contains multiple ordered steps
 */
export type Lab = Lo & {
  type: "lab";
  los: LabStep[];
  pdf: string;
  pdfFile: string;
};

/**
 * Talk learning object
 * Represents a presentation or lecture
 */
export type Talk = Lo & {
  type: "talk";
  pdf: string;
  pdfFile: string;
};

/**
 * Archive learning object
 * Represents downloadable content
 */
export type Archive = Lo & {
  type: "archive";
  archiveFile?: string;
};

/**
 * Web resource learning object
 */
export type Web = Lo & {
  type: "web";
};

/**
 * GitHub repository learning object
 */
export type Github = Lo & {
  type: "github";
};

/**
 * Tutorial learning object
 * Simple text content
 */
export type Tutorial = Lo & {
  type: "tutorial";
  pdf: string;
  pdfFile: string;
};

/**
 * Note learning object
 * Simple text content
 */
export type Note = Lo & {
  type: "note";
};

/**
 * Notebook output from a code cell execution
 */
export type NotebookOutput = {
  outputType: "stream" | "execute_result" | "display_data" | "error";
  text?: string;
  data?: Record<string, string>;
  traceback?: string[];
  name?: string;
  executionCount?: number | null;
};

/**
 * A single cell in a Jupyter notebook
 */
export type NotebookCell = {
  cellType: "markdown" | "code" | "raw";
  source: string;
  sourceHtml?: string;
  outputs: NotebookOutput[];
  outputsHtml?: string;
  executionCount: number | null;
  metadata: Record<string, unknown>;
  id: string;
};

/**
 * Notebook learning object
 * Represents a Jupyter notebook with cells
 */
export type Notebook = Lo & {
  type: "notebook";
  cells: NotebookCell[];
  kernelLanguage: string;
  kernelName: string;
};

/**
 * Podcast learning object
 * Represents a podcast episode
 */
export type Podcast = Lo & {
  type: "podcast";
  episode: PodcastEpisodeIdentifier;
};

/**
 * Panel-style note learning object
 */
export type PanelNote = Lo & {
  type: "panelnote";
};

/**
 * Panel-style talk learning object
 */
export type PanelTalk = Talk & {
  type: "paneltalk";
};

/**
 * Panel-style video learning object
 */
export type PanelVideo = Lo & {
  type: "panelvideo";
};

/**
 * Collection of panel-style learning objects
 */
export type Panels = {
  panelVideos: PanelVideo[];
  panelTalks: PanelTalk[];
  panelNotes: PanelNote[];
  panelPodcasts: Podcast[];
};

/**
 * Collection of course units and sides
 */
export type Units = {
  units: Unit[];
  sides: Side[];
  standardLos: Lo[];
};

/**
 * Composite learning object structure
 */
export type Composite = Lo & {
  toc: Lo[];
  los: Lo[];
  panels: Panels;
  units: Units;
};

/**
 * Topic learning object
 * Groups related content
 */
export type Topic = Composite & {
  type: "topic";
};

/**
 * Unit learning object
 * Major course section
 */
export type Unit = Composite & {
  type: "unit";
};

/**
 * Side learning object
 * Supplementary content
 */
export type Side = Composite & {
  type: "side";
};

/**
 * Course learning object
 * Top-level container for all course content
 */
export type Course = Composite & {
  type: "course";
  courseId: string;
  courseUrl: string;
  topicIndex: Map<string, Topic>;
  loIndex: Map<string, Lo>;
  walls?: Lo[][];
  wallMap?: Map<string, Lo[]>;
  properties: Properties;
  calendar?: Properties;
  enrollment?: Enrollment;
  courseCalendar?: Calendar;
  authLevel: number;
  isPortfolio: boolean;
  isPrivate: boolean;
  llm: number;
  pdfOrientation: string;
  areVideosHidden: boolean;
  areLabStepsAutoNumbered: boolean;
  hasEnrollment: boolean;
  hasCalendar: boolean;
  defaultPdfReader: string;
  footer: string;
  ignorePin: string;
  companions: IconNavBar;
  wallBar: IconNavBar;
};
