import { inspectAndExtractArchive } from "./archive-intake.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const archive = option("--archive");
if (!archive) {
  throw new Error("Usage: npm run inspect:archive -- --archive <file.rar|file.zip|file.7z> [--output <quarantine-directory>]");
}

const result = await inspectAndExtractArchive(archive, {
  outputDirectory: option("--output"),
  sevenZipPath: option("--7z"),
});

console.log(JSON.stringify(result, null, 2));
if (result.inspection.requiresTallyRestore) {
  console.error("This appears to be native Tally data. Restore it in the compatible Tally release, then use the read-only TallyBridge export.");
}
