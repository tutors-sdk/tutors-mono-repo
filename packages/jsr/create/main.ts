import { runCli } from "./src/cli.ts";
import { runValidate } from "./src/validate-cli.ts";

// Run the CLI only when this module is the program entry point, so importing the package as a library
// never triggers the prompts. `validate` checks a course folder; anything else starts the creator.
if (import.meta.main) {
  const [command, ...rest] = Deno.args;
  if (command === "validate") {
    Deno.exitCode = await runValidate(rest, { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) });
  } else {
    runCli();
  }
}
