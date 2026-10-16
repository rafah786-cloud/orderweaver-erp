import { TALLY_SOURCES } from "./tally-bulk";

export type FolderScan = {
  companies: Array<{ company: string; folder: string; files: number; xml: number; manifests: number }>;
  missing: string[];
  unsupported: string[];
};

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "");

/** Groups folder-picker files by company subfolder (any depth) using their relative paths. */
export function scanTallyFolder(files: Array<{ name: string; webkitRelativePath?: string }>): FolderScan {
  const match = (p: string) => TALLY_SOURCES.find((s) => norm(s) === norm(p)) ?? null;
  const entries = files.map((f) => {
    const parts = (f.webkitRelativePath || f.name).replaceAll("\\", "/").split("/").slice(0, -1);
    return { f, parts, idx: parts.findIndex((p) => match(p) !== null) };
  });
  // Company level = depth at which known company folders sit (selected root and wrapper folders are above it).
  const depths = entries.filter((e) => e.idx >= 0).map((e) => e.idx);
  const level = depths.length ? Math.min(...depths) : 1;
  const parentPrefixes = new Set(entries.filter((e) => e.idx >= 0).map((e) => e.parts.slice(0, e.idx).join("/")));
  const byFolder = new Map<string, { company: string | null; files: number; xml: number; manifests: number }>();
  for (const { f, parts, idx } of entries) {
    let folder = "";
    let company: string | null = null;
    if (idx >= 0) { folder = parts.slice(0, idx + 1).join("/"); company = match(parts[idx]); }
    else if (parts.length > level) {
      const parent = parts.slice(0, level).join("/");
      // only siblings of company folders count; files in the root/wrapper folders are ignored
      if (parentPrefixes.size === 0 || parentPrefixes.has(parent)) folder = parts.slice(0, level + 1).join("/");
    }
    if (!folder) continue;
    const e = byFolder.get(folder) ?? { company, files: 0, xml: 0, manifests: 0 };
    e.files++; if (/\.xml$/i.test(f.name)) e.xml++; if (f.name.toLowerCase() === "manifest.json") e.manifests++;
    byFolder.set(folder, e);
  }
  const companies = [...byFolder].filter(([, e]) => e.company).map(([folder, e]) => ({ company: e.company!, folder, files: e.files, xml: e.xml, manifests: e.manifests }));
  const unsupported = [...byFolder].filter(([, e]) => !e.company).map(([folder]) => folder);
  const missing = TALLY_SOURCES.filter((s) => !companies.some((c) => c.company === s));
  return { companies, missing, unsupported };
}
