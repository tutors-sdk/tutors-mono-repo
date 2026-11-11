import { describe, expect, it } from "vitest";
import { BIN_FOLDER, MemoryFileSystem, type FileSystemPort } from "../../../packages/jsr/course-rules/src/mod.ts";
import { rewireUsage, runRewire } from "../../../packages/jsr/create/src/rewire-cli.ts";

/** Every run names its course and opens it in memory, so no mutant can touch a folder on disk. */
const course = () =>
  new MemoryFileSystem({
    "course.md": "# Web\n",
    "properties.yaml": "credits: Leigh\n",
    "topic-01/topic.md": "# Week 1\n",
    "topic-02/topic.md": "# Week 2\n",
    "topic-01/talk-01-html/talk.md": "# HTML\n",
    "topic-01/talk-02-css/talk.md": "# CSS\n"
  });

async function rewire(args: string[], fs: FileSystemPort = course()) {
  let out = "";
  let err = "";
  const opened: string[] = [];
  const status = await runRewire(args, {
    out: (text) => (out += text),
    err: (text) => (err += text),
    open: (dir) => {
      opened.push(dir);
      return fs;
    }
  });
  return { status, out, err, opened, fs };
}

const text = async (fs: FileSystemPort, path: string) => new TextDecoder().decode(await fs.read(path));

describe("tutors rewire", () => {
  it("reorders, and reports each swap as the one move asked for", async () => {
    const run = await rewire(["reorder", "topic-01", "talk-02-css", "talk-01-html", "--course", "web"]);
    expect(run).toMatchObject({ status: 0, err: "", opened: ["web"] });
    expect(run.out).toBe("moved   topic-01/talk-02-css to topic-01/talk-01-css\nmoved   topic-01/talk-01-html to topic-01/talk-02-html\n");
  });

  it("moves, retitles, hides, shows, removes and restores", async () => {
    const fs = course();
    expect((await rewire(["move", "topic-01/talk-02-css", "topic-02", "--course=web"], fs)).out).toBe("moved   topic-01/talk-02-css to topic-02/talk-01-css\n");
    expect((await rewire(["retitle", "topic-02/talk-01-css", "Styling", "--course", "web"], fs)).out).toBe("wrote   topic-02/talk-01-css/talk.md\n");
    expect(await text(fs, "topic-02/talk-01-css/talk.md")).toBe("# Styling\n");
    await rewire(["hide", "topic-02", "--course", "web"], fs);
    expect(await text(fs, "properties.yaml")).toBe("credits: Leigh\nignore:\n  - topic-02\n");
    await rewire(["show", "topic-02", "--course", "web"], fs);
    expect(await text(fs, "properties.yaml")).toBe("credits: Leigh\n");
    expect((await rewire(["remove", "topic-01/talk-01-html", "--course", "web"], fs)).out).toBe(`moved   topic-01/talk-01-html to ${BIN_FOLDER}/talk-01-html\n`);
    expect((await rewire(["restore", "talk-01-html", "topic-02", "--course", "web"], fs)).out).toBe(`moved   ${BIN_FOLDER}/talk-01-html to topic-02/talk-02-html\n`);
  });

  it("prints the plan as JSON and changes nothing with --plan", async () => {
    const run = await rewire(["--plan", "move", "topic-01/talk-02-css", "topic-02", "--course", "web"]);
    expect(run.status).toBe(0);
    expect(JSON.parse(run.out)).toEqual({ ops: [{ op: "move", from: "topic-01/talk-02-css", to: "topic-02/talk-01-css" }], notes: [] });
    expect(await run.fs.exists("topic-01/talk-02-css/talk.md")).toBe(true);
  });

  it("says when there is nothing to change, and prints a plan's notes", async () => {
    expect((await rewire(["move", "topic-01/talk-01-html", "topic-01", "--course", "web"])).out).toBe("Nothing to change.\n");
    const linked = course();
    await linked.write("topic-02/topic.md", new TextEncoder().encode("# Week 2\n\nSee talk-01-html.\n"));
    const run = await rewire(["remove", "topic-01/talk-01-html", "--course", "web"], linked);
    expect(run.out.split("\n")[1]).toContain('"talk-01-html"');
  });

  it("prints the reason and exits 1 when a change is refused", async () => {
    const run = await rewire(["hide", "topic-01/talk-01-html", "--course", "web"]);
    expect(run).toMatchObject({ status: 1, out: "" });
    expect(run.err).toMatch(/^Tutors can hide only a whole topic or unit.*\n$/);
  });

  it("reports what it skipped and exits 1 when the folder refuses a change", async () => {
    const fs = course();
    const stubborn: FileSystemPort = {
      ...fs,
      list: (d) => fs.list(d),
      read: (p) => fs.read(p),
      exists: (p) => fs.exists(p),
      write: (p, b) => fs.write(p, b),
      move: () => Promise.reject(new Error("locked"))
    };
    const run = await rewire(["remove", "topic-01/talk-01-html", "--course", "web"], stubborn);
    expect(run).toMatchObject({ status: 1, out: `skipped topic-01/talk-01-html to ${BIN_FOLDER}/talk-01-html: locked\n` });
    const writes: FileSystemPort = { ...stubborn, write: () => Promise.reject(new Error("read-only")) };
    expect((await rewire(["retitle", "topic-01", "New", "--course", "web"], writes)).out).toBe("skipped topic-01/topic.md: read-only\n");
  });

  it("prints the usage and exits 3 for an action it doesn't know or the wrong number of words", async () => {
    for (const args of [[], ["rename", "a"], ["move", "a"], ["move", "a", "b", "c"], ["reorder", "topic-01"], ["hide", "a", "--course", ""], ["hide", "a", "--course"]]) {
      const run = await rewire(args);
      expect(run).toMatchObject({ status: 3, out: "", err: rewireUsage, opened: [] });
    }
  });

  it("works on the current folder when no course is named, and exits 3 when it can't be read", async () => {
    expect((await rewire(["hide", "topic-01"])).opened).toEqual(["."]);
    let err = "";
    const status = await runRewire(["hide", "topic-01", "--course", "gone"], {
      out: () => {},
      err: (text) => (err += text),
      open: () => {
        throw new Error("no such folder");
      }
    });
    expect(status).toBe(3);
    expect(err).toBe("Couldn't read the course folder gone: no such folder\n");
  });
});
