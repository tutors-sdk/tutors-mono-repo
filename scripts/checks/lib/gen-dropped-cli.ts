/**
 * Prints, as a JSON array, the folders the generator leaves out of the course at the given path.
 * Run under Deno (the generator's own runtime): scripts/checks/validate-corpus.ts calls it, because the
 * generator's top-level await and npm: imports don't load under tsx.
 *
 *   deno run -A --no-check --no-lock --node-modules-dir=none scripts/checks/lib/gen-dropped-cli.ts <course folder>
 */
import process from "node:process";
import { droppedByGen } from "./gen-dropped.ts";

process.stdout.write(JSON.stringify(droppedByGen(process.argv[2])) + "\n");
