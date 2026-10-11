import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const reader = createRequire(new URL("../../../apps/reader/package.json", import.meta.url));
// Reuse the reader's Svelte and Kit installs; generated node_modules is ignored alongside .svelte-kit.
const modules = fileURLToPath(new URL("./node_modules", import.meta.url));
for (const name of ["svelte", "@sveltejs/kit"]) {
  const target = join(modules, name);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(target)) symlinkSync(fileURLToPath(new URL(`../../../apps/reader/node_modules/${name}`, import.meta.url)), target, "junction");
}
const { createServer } = await import(reader.resolve("vite"));
process.chdir(fileURLToPath(new URL(".", import.meta.url)));
const server = await createServer({ server: { port: Number(process.argv[2]), strictPort: true } });
await server.listen();
