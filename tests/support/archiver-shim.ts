import { ZipArchive, TarArchive } from "archiver";

export default function archiver(format: string, options?: any) {
  if (format === "zip") return new ZipArchive(options);
  if (format === "tar") return new TarArchive(options);
  throw new Error(`Unknown archiver format: ${format}`);
}
