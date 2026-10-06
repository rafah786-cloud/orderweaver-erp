import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { TallyClient, collectionRequest, dataRequest, type TallyRequestOptions } from "./tally-client.js";

export const MASTER_COLLECTIONS = [
  "List of Groups",
  "List of Ledgers",
  "List of Stock Items",
  "List of Godowns",
  "List of Cost Centres",
] as const;

export type SnapshotOptions = TallyRequestOptions & {
  outputDir: string;
  includeDayBook: boolean;
  chunkMonths: number;
};

function shiftMonths(date: string, months: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function nextDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function save(root: string, name: string, xml: string) {
  const path = root + "/" + name;
  await writeFile(path, xml, "utf8");
  return {
    path,
    bytes: Buffer.byteLength(xml, "utf8"),
    sha256: createHash("sha256").update(xml).digest("hex"),
  };
}

export async function snapshotCompany(client: TallyClient, options: SnapshotOptions) {
  const root = options.outputDir + "/" + options.company.replace(/[^a-z0-9._-]+/gi, "_");
  await mkdir(root, { recursive: true });
  const segments: any[] = [];

  for (const collection of MASTER_COLLECTIONS) {
    const response = await client.request(collection, collectionRequest(collection, options), options);
    segments.push({ name: collection, kind: "collection", ...(await save(
      root, "master-" + collection.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".xml", response.xml
    ))});
  }

  if (options.includeDayBook) {
    let cursor = options.fromDate || "";
    const endDate = options.toDate || cursor;
    let index = 1;
    while (cursor && cursor <= endDate) {
      const chunkEnd = shiftMonths(cursor, options.chunkMonths) < endDate
        ? shiftMonths(cursor, options.chunkMonths) : endDate;
      const requestOptions = { ...options, fromDate: cursor, toDate: chunkEnd };
      const response = await client.request("DayBook", dataRequest("DayBook", requestOptions), requestOptions);
      segments.push({ name: "DayBook", kind: "data", fromDate: cursor, toDate: chunkEnd, ...(await save(
        root, "daybook-" + String(index).padStart(4, "0") + "-" + cursor + "-" + chunkEnd + ".xml", response.xml
      ))});
      index++;
      cursor = nextDay(chunkEnd);
    }
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    company: options.company,
    fromDate: options.fromDate,
    toDate: options.toDate,
    segments,
  };
  await writeFile(root + "/manifest.json", JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}
