import { spawn } from "node:child_process";
import { path7za } from "7zip-bin";
import { mkdir, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type ArchiveEntry = {
  path: string;
  size: number;
  directory: boolean;
};

export type ArchiveInspection = {
  archivePath: string;
  archiveBytes: number;
  entryCount: number;
  totalExpandedBytes: number;
  tallyLikeFiles: Array<{ path: string; size: number; kind: "xml-export" | "native-data" | "backup-metadata" | "unknown" }>;
  companyCandidates: string[];
  requiresTallyRestore: boolean;
  warnings: string[];
};

export type ArchiveLimits = {
  maxEntries?: number;
  maxExpandedBytes?: number;
};

const DEFAULT_LIMITS: Required<ArchiveLimits> = {
  maxEntries: 100_000,
  maxExpandedBytes: 50 * 1024 * 1024 * 1024,
};

function run(command: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Archive command timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (part: string) => { stdout += part; });
    child.stderr.setEncoding("utf8").on("data", (part: string) => { stderr += part; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Could not run ${command}. The bundled 7-Zip executable could not be started; reinstall dependencies or set SEVEN_ZIP_PATH. ${error.message}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Archive command failed (exit ${code}): ${stderr.slice(0, 1200)}`));
      else resolve(stdout);
    });
  });
}

function isUnsafeArchivePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").some((part) => part === "..") ||
    normalized.includes("\0");
}

/** Parse 7-Zip's technical listing, and reject unsafe names before extraction. */
export function parse7zListing(listing: string, limits: ArchiveLimits = {}): ArchiveEntry[] {
  const maxEntries = limits.maxEntries ?? DEFAULT_LIMITS.maxEntries;
  const maxExpandedBytes = limits.maxExpandedBytes ?? DEFAULT_LIMITS.maxExpandedBytes;
  const entries: ArchiveEntry[] = [];
  for (const block of listing.split(/\r?\n\s*\r?\n/)) {
    const fields = new Map<string, string>();
    for (const line of block.split(/\r?\n/)) {
      const match = line.match(/^([^=]+?)\s*=\s*(.*)$/);
      if (match) fields.set(match[1].trim(), match[2]);
    }
    const name = fields.get("Path");
    if (!name || name === "----------" || (!fields.has("Folder") && !fields.has("Attributes"))) continue;
    if (isUnsafeArchivePath(name)) throw new Error(`Unsafe archive path rejected: ${name}`);
    const attributes = fields.get("Attributes") ?? "";
    if (/^L/i.test(attributes) || fields.has("Symbolic Link") || fields.has("Hard Link")) {
      throw new Error(`Symbolic link rejected in archive: ${name}`);
    }
    const sizeText = fields.get("Size") ?? "0";
    if (!/^\d+$/.test(sizeText)) throw new Error(`Invalid size metadata for archive entry: ${name}`);
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Unsafe size metadata for archive entry: ${name}`);
    const directory = fields.get("Folder") === "+" || /D/.test(attributes);
    entries.push({ path: name, size: directory ? 0 : size, directory });
    if (entries.length > maxEntries) throw new Error(`Archive exceeds the ${maxEntries} entry safety limit.`);
  }
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total > maxExpandedBytes) throw new Error(`Archive expands beyond the ${maxExpandedBytes} byte safety limit.`);
  return entries;
}

function classify(filePath: string): ArchiveInspection["tallyLikeFiles"][number]["kind"] {
  const base = path.posix.basename(filePath).toLowerCase();
  const ext = path.posix.extname(base);
  if (ext === ".xml") return "xml-export";
  if (/^(company|companyinfo|manifest|readme|backupinfo)(\.|$)/i.test(base) || ext === ".ini" || ext === ".log") return "backup-metadata";
  // Native Tally data backups are proprietary; extension alone cannot certify a file.
  if (/^\d{4,}$/.test(base) || [".900", ".tsf", ".dat", ".db", ".dct"].includes(ext)) return "native-data";
  return "unknown";
}

export function buildInspection(archivePath: string, archiveBytes: number, entries: ArchiveEntry[]): ArchiveInspection {
  const files = entries.filter((entry) => !entry.directory);
  const tallyLikeFiles = files
    .filter((entry) => classify(entry.path) !== "unknown")
    .map((entry) => ({ path: entry.path, size: entry.size, kind: classify(entry.path) }));
  const xmlCount = tallyLikeFiles.filter((entry) => entry.kind === "xml-export").length;
  const nativeCount = tallyLikeFiles.filter((entry) => entry.kind === "native-data").length;
  const nestedPaths = files.map((entry) => entry.path.replaceAll("\\", "/")).filter((value) => value.includes("/"));
  const topFolders = [...new Set(nestedPaths.map((value) => value.split("/")[0]).filter(Boolean))];
  const warnings: string[] = [];
  if (!files.length) warnings.push("Archive contains no files.");
  if (!xmlCount && nativeCount) warnings.push("Native Tally data detected. Restore/open it with the compatible Tally release, then export through the read-only TallyBridge; do not parse binary files as XML.");
  if (!xmlCount && !nativeCount) warnings.push("No recognizable Tally XML export or native-data filename detected. Manual review is required.");
  if (xmlCount && nativeCount) warnings.push("Mixed XML and native-data files detected. Keep each source type separate and identify which company/period each file represents.");
  return {
    archivePath,
    archiveBytes,
    entryCount: entries.length,
    totalExpandedBytes: files.reduce((sum, entry) => sum + entry.size, 0),
    tallyLikeFiles,
    companyCandidates: topFolders.length ? topFolders : [...new Set(files.map((f) => path.posix.basename(f.path).split(".")[0]).filter(Boolean))].slice(0, 50),
    requiresTallyRestore: nativeCount > 0 && xmlCount === 0,
    warnings,
  };
}

/** Inspect and safely extract a RAR/ZIP/7z archive to a private temporary directory. */
export async function inspectAndExtractArchive(
  archivePath: string,
  options: ArchiveLimits & { sevenZipPath?: string; outputDirectory?: string } = {},
): Promise<{ inspection: ArchiveInspection; extractedDirectory: string }> {
  const resolvedArchive = await realpath(archivePath);
  const archiveStat = await stat(resolvedArchive);
  if (!archiveStat.isFile()) throw new Error("Archive path must point to a file.");
  if (!/\.(rar|zip|7z)$/i.test(resolvedArchive)) throw new Error("Supported archive extensions are .rar, .zip and .7z.");
  const sevenZip = options.sevenZipPath || process.env.SEVEN_ZIP_PATH || path7za;
  const listing = await run(sevenZip, ["l", "-slt", "--", resolvedArchive]);
  const entries = parse7zListing(listing, options);
  if (!entries.length) throw new Error("Archive listing is empty; refusing to extract.");
  const tempRoot = options.outputDirectory
    ? path.resolve(options.outputDirectory)
    : await mkdtemp(path.join(tmpdir(), "mattress-maestro-tally-"));
  if (options.outputDirectory) await mkdir(tempRoot, { recursive: false });
  try {
    await run(sevenZip, ["x", "-y", `-o${tempRoot}`, "--", resolvedArchive]);
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
  const rootReal = await realpath(tempRoot);
  async function verifyTree(current: string): Promise<void> {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      const actual = await realpath(full);
      if (actual !== rootReal && !actual.startsWith(rootReal + path.sep)) {
        throw new Error("Extracted path escaped the quarantine directory.");
      }
      if (item.isSymbolicLink()) throw new Error("Extracted symbolic links are not accepted.");
      if (item.isDirectory()) await verifyTree(full);
    }
  }
  try {
    await verifyTree(rootReal);
  } catch (error) {
    await rm(rootReal, { recursive: true, force: true });
    throw error;
  }
  return {
    inspection: buildInspection(resolvedArchive, archiveStat.size, entries),
    extractedDirectory: rootReal,
  };
}
