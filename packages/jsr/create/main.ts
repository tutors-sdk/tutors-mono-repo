import { runCli } from "./src/cli.ts";
import { runValidate } from "./src/validate-cli.ts";
import { runPatternCreate } from "./src/pattern-cli.ts";

// Run the CLI only when this module is the program entry point, so importing the package as a library
// never triggers the prompts. `validate` checks a course folder, `--pattern` creates a course from a
// teaching pattern without prompts, and anything else starts the interactive creator.
if (import.meta.main) {
  const [command, ...rest] = Deno.args;
  if (command === "validate") {
    Deno.exitCode = await runValidate(rest, { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) });
  } else if (Deno.args.some((arg) => arg === "--pattern" || arg.startsWith("--pattern="))) {
    Deno.exitCode = runPatternCreate(Deno.args, { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) });
  } else {
    runCli();
  }
}
