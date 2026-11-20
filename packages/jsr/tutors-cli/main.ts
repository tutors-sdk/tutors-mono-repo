import process from "node:process";
import { runValidate } from "@tutors/tutors-create/validate";
import { runImport } from "@tutors/tutors-create/import";
import { runRewire } from "@tutors/tutors-create/rewire";
import { runPatternCreate } from "@tutors/tutors-create/pattern";
import { runCli } from "@tutors/tutors-create/cli";
import { commandFor, usage } from "./src/commands.ts";
import config from "./deno.json" with { type: "json" };

// One program for every Tutors tool (Rule 0777). The generator and tutors-lite build the course in the current
// folder when their main module is loaded, exactly as `deno run jsr:@tutors/tutors` does, so they are imported
// here only when asked for; the literal specifiers let `deno compile` carry them.
const io = { out: (text: string) => process.stdout.write(text), err: (text: string) => process.stderr.write(text) };
const command = commandFor(Deno.args);
switch (command.kind) {
  case "build":
    await import("@tutors/tutors");
    break;
  case "website":
    await import("@tutors/tutors-lite");
    break;
  case "validate":
    Deno.exitCode = await runValidate(command.args, io);
    break;
  case "import":
    Deno.exitCode = await runImport(command.args, io);
    break;
  case "rewire":
    Deno.exitCode = await runRewire(command.args, io);
    break;
  case "create":
    if (command.args.some((arg) => arg === "--pattern" || arg.startsWith("--pattern="))) Deno.exitCode = runPatternCreate(command.args, io);
    else runCli();
    break;
  case "version":
    process.stdout.write(`tutors ${config.version}\n`);
    break;
  case "help":
    if (command.unknown) process.stderr.write(`tutors: no command "${command.unknown}"\n\n`);
    (command.unknown ? process.stderr : process.stdout).write(usage);
    Deno.exitCode = command.unknown ? 2 : 0;
    break;
}
