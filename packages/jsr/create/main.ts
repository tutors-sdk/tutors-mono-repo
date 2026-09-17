import { runCli } from "./src/cli.ts";

// Run the interactive CLI only when this module is the program entry point,
// so importing the package as a library never triggers the prompts.
if (import.meta.main) {
  runCli();
}
