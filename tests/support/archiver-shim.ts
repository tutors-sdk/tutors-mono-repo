import { ZipArchive, TarArchive } from "../../node_modules/.pnpm/archiver@8.0.0/node_modules/archiver/index.js";

export default function archiver(format: string, options?: any) {
  if (format === "zip") return new ZipArchive(options);
  if (format === "tar") return new TarArchive(options);
  throw new Error(`Unknown archiver format: ${format}`);
}
