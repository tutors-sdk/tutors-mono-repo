import type { Course, Lab, Lo, Talk, Topic, Unit } from "@tutors/tutors-model-lib";
import { filterByType } from "@tutors/tutors-model-lib";
import { publishTemplate } from "../templates/template-engine.ts";
import { buildLmsRuntimeScript, LMS_RUNTIME_FILE } from "../scorm/lms-runtime.ts";
import { writeFile } from "../utils/file-utils.ts";
import { isMarpContent, renderMarpToStaticHtml } from "./marp-renderer.ts";

async function emitTalk(lo: Talk, path: string) {
  const talkPath = `${path}/${lo.id}`;
  if (isMarpContent(lo)) {
    const { slidesHtml, css } = renderMarpToStaticHtml(lo);
    await publishTemplate(talkPath, "index.html", "Talk", { ...lo, marpHtml: slidesHtml, marpCss: css });
  } else {
    await publishTemplate(talkPath, "index.html", "Talk", lo);
  }
}

async function emitNote(lo: Lo, path: string) {
  const notePath = `${path}/${lo.id}`;
  await publishTemplate(notePath, "index.html", "Note", lo);
}

async function emitScorm(lo: Lo, path: string) {
  const scormPath = `${path}/${lo.id}`;
  await publishTemplate(scormPath, "index.html", "Scorm", lo);
}

async function emitTutorial(lo: Lo, path: string) {
  const tutorialPath = `${path}/${lo.id}`;
  await publishTemplate(tutorialPath, "index.html", "Tutorial", lo);
}


async function emitLab(lo: Lab, path: string) {
  const labPath = `${path}/${lo.id}`;
  for (let index = 0; index < lo.los.length; index++) {
    const step = lo.los[index];
    const nextStep = index < lo.los.length - 1 ? lo.los[index + 1] : null;
    const prevStep = index > 0 ? lo.los[index - 1] : null;
    if (index === 0) {
      await publishTemplate(labPath, "index.html", "Lab", { lab: lo, labStep: step, nextStep: nextStep, prevStep: prevStep });
    } else {
      await publishTemplate(labPath, `${step.shortTitle}.html`, "Lab", { lab: lo, labStep: step, nextStep: nextStep, prevStep: prevStep });
    }
  }
}

async function emitLoPage(lo: Lo, path: string) {
  if (lo.type == "lab") {
    await emitLab(lo as Lab, path);
  }
  if (lo.type == "note" || lo.type == "panelnote") {
    await emitNote(lo as Lo, path);
  }
  if (lo.type == "tutorial") {
    await emitTutorial(lo as Lo, path);
  }
  if (lo.type == "topic") {
    await emitComposite(lo as Topic, `${path}`);
  }
  if (lo.type == "talk") {
    await emitTalk(lo as Talk, `${path}`);
  }
  if (lo.type == "scorm") {
    await emitScorm(lo, path);
  }
}

async function emitUnit(lo: Unit, path: string) {
  for (const loItem of lo.los) {
    await emitLoPage(loItem as Lo, path);
  }
}

async function emitLo(lo: Lo, path: string) {
  if (lo.type == "unit" || lo.type == "side") {
    const unitPath = `${path}/${lo.id}`;
    await emitUnit(lo as Unit, unitPath);
  } else {
    await emitLoPage(lo, path);
  }
}

async function emitComposite(lo: Topic, path: string) {
  const topicPath = `${path}/${lo.id}`;
  if (lo.los) {
    for (const loItem of lo.los) {
      await emitLo(loItem as Lo, topicPath);
    }
  }
  await publishTemplate(topicPath, "index.html", "Composite", lo);
}

export async function emitWalls(path: string, lo: Course) {
  if (lo.walls) {
    for (const los of lo.walls) {
      await publishTemplate(path, `${los[0].type}.html`, "Wall", { course: lo, los: los });
    }
  }
}

export async function emitStaticCourse(path: string, lo: Course) {
  if (lo.los) {
    for (const loItem of lo.los) {
      await emitComposite(loItem as Topic, path);
    }
  }
  await publishTemplate(path, "index.html", "Composite", lo);
  await emitWalls(path, lo);
  // Every imported SCO shares one run-time, written to the course root and reached from
  // any depth through the relative path the templates already compute.
  if (filterByType(lo.los ?? [], "scorm").length > 0) {
    writeFile(path, LMS_RUNTIME_FILE, buildLmsRuntimeScript());
  }
}
