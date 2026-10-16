import { TALLY_SOURCES } from "./tally-bulk";

export type FolderScan = {
  companies: Array<{ company: string; folder: string; files: number; xml: number; manifests: number }>;
  missing: string[];
  unsupported: string[];
};

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "");

/** Groups folder-picker files by company subfolder (any depth) using their relative paths. */
export function scanTallyFolder(files: Array<{ name: string; webkitRelativePath?: string }>): FolderScan {
  const byFolder = new Map<string, { company: string | null; files: number; xml: number; manifests: number }>();
  for (const f of files) {
    const parts = (f.webkitRelativePath || f.name).replaceAll("\\", "/").split("/").slice(0, -1);
    const idx = parts.findIndex((p) => TALLY_SOURCES.some((s) => norm(s) === norm(p)));
    const folder = idx >= 0 ? parts.slice(0, idx + 1).join("/") : parts.length > 1 ? parts.slice(0, 2).join("/") : "";
    if (!folder) continue; // loose files at the selected root are ignored
    const company = idx >= 0 ? TALLY_SOURCES.find((s) => norm(s) === norm(parts[idx])) ?? null : null;
    const e = byFolder.get(folder) ?? { company, files: 0, xml: 0, manifests: 0 };
    e.files++; if (/\.xml$/i.test(f.name)) e.xml++; if (f.name.toLowerCase() === "manifest.json") e.manifests++;
    byFolder.set(folder, e);
  }
  const companies = [...byFolder].filter(([, e]) => e.company).map(([folder, e]) => ({ company: e.company!, folder, files: e.files, xml: e.xml, manifests: e.manifests }));
  const unsupported = [...byFolder].filter(([, e]) => !e.company).map(([folder]) => folder);
  const missing = TALLY_SOURCES.filter((s) => !companies.some((c) => c.company === s));
  return { companies, missing, unsupported };
}
