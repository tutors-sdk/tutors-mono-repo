import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const reader = createRequire(new URL("../../../apps/reader/package.json", import.meta.url));
// Reuse the reader's Svelte install; generated node_modules is ignored alongside .svelte-kit.
const modules = fileURLToPath(new URL("./node_modules", import.meta.url));
mkdirSync(modules, { recursive: true });
if (!existsSync(`${modules}/svelte`)) symlinkSync(fileURLToPath(new URL("../../../apps/reader/node_modules/svelte", import.meta.url)), `${modules}/svelte`, "junction");
const { createServer } = await import(reader.resolve("vite"));
process.chdir(fileURLToPath(new URL(".", import.meta.url)));
const server = await createServer({ server: { port: Number(process.argv[2]), strictPort: true } });
await server.listen();
