import { TallyClient } from "./tally-client.js";
import { snapshotCompany } from "./snapshot.js";

function values(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === name) out.push(process.argv[i + 1]);
  }
  return out;
}

function value(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const companies = values("--company");
const fromDate = value("--from");
const toDate = value("--to");
const outputDir = value("--output", "./tally-snapshots") || "./tally-snapshots";
const includeDayBook = !process.argv.includes("--masters-only");
const chunkMonths = Math.max(1, Number(value("--chunk-months", "1") || "1"));

if (!companies.length) throw new Error("At least one --company is required.");
if (!fromDate || !toDate) throw new Error("--from and --to are required.");

const client = new TallyClient();

for (const company of companies) {
  console.log("[tally-bridge] Pulling " + company);
  const manifest = await snapshotCompany(client, {
    company, fromDate, toDate, outputDir, includeDayBook, chunkMonths,
  });
  const bytes = manifest.segments.reduce((n: number, s: any) => n + s.bytes, 0);
  console.log("[tally-bridge] " + company + ": " + manifest.segments.length +
    " segments, " + (bytes / 1024 / 1024).toFixed(1) + " MiB");
}

console.log("[tally-bridge] Read-only extraction complete.");
