import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  TallyClient,
  collectionRequest,
  dataRequest,
  type TallyRequestOptions,
} from "./tally-client.js";

export const MASTER_COLLECTIONS = [
  "List of Groups",
  "List of Ledgers",
  "List of Stock Items",
  "List of Godowns",
  "List of Cost Centres",
] as const;

const EXPECTED_RECORD_TAG: Record<(typeof MASTER_COLLECTIONS)[number], string> = {
  "List of Groups": "GROUP",
  "List of Ledgers": "LEDGER",
  "List of Stock Items": "STOCKITEM",
  "List of Godowns": "GODOWN",
  "List of Cost Centres": "COSTCENTRE",
};

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

/** Tally can emit XML 1.0-invalid control bytes in otherwise valid exports. */
export function sanitizeTallyXml(xml: string): string {
  return xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/** Reject error screens or wrong collection responses before saving them as migration data. */
export function validateCollectionResponse(
  collection: (typeof MASTER_COLLECTIONS)[number],
  rawXml: string,
): { xml: string; recordCount: number } {
  const xml = sanitizeTallyXml(rawXml);
  if (!/<ENVELOPE\b/i.test(xml) || !/<DATA\b/i.test(xml)) {
    throw new Error(collection + ": Tally response is not an export envelope.");
  }
  const status = xml.match(/<STATUS>\s*(-?\d+)\s*<\/STATUS>/i)?.[1];
  if (status !== "1") {
    throw new Error(collection + ": Tally export status was " + (status ?? "missing") + ".");
  }
  const expectedTag = EXPECTED_RECORD_TAG[collection];
  const recordCount = (xml.match(new RegExp("<" + expectedTag + "(?=\\s|>)", "gi")) ?? []).length;
  if (recordCount === 0 && (collection === "List of Groups" || collection === "List of Ledgers")) {
    throw new Error(collection + ": no <" + expectedTag + "> records were returned; refusing to save a misleading export.");
  }
  return { xml, recordCount };
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
    const response = await client.request(
      collection,
      collectionRequest(collection, options),
      options,
    );
    const validated = validateCollectionResponse(collection, response.xml);
    const saved = await save(
      root,
      "master-" + collection.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".xml",
      validated.xml,
    );
    segments.push({
      name: collection,
      kind: "collection",
      recordCount: validated.recordCount,
      ...saved,
    });
    console.log("[tally-bridge] " + options.company + " / " + collection + ": " + validated.recordCount + " records");
  }

  if (options.includeDayBook) {
    let cursor = options.fromDate || "";
    const endDate = options.toDate || cursor;
    let index = 1;
    while (cursor && cursor <= endDate) {
      const chunkEnd =
        shiftMonths(cursor, options.chunkMonths) < endDate
          ? shiftMonths(cursor, options.chunkMonths)
          : endDate;
      const requestOptions = {
        ...options,
        fromDate: cursor,
        toDate: chunkEnd,
      };
      const response = await client.request(
        "DayBook",
        dataRequest("DayBook", requestOptions),
        requestOptions,
      );
      const cleanXml = sanitizeTallyXml(response.xml);
      if (!/<ENVELOPE\b/i.test(cleanXml) || !/<DATA\b/i.test(cleanXml)) {
        throw new Error("DayBook " + cursor + " to " + chunkEnd + ": invalid Tally export envelope.");
      }
      const saved = await save(
        root,
        "daybook-" + String(index).padStart(4, "0") + "-" + cursor + "-" + chunkEnd + ".xml",
        cleanXml,
      );
      segments.push({
        name: "DayBook",
        kind: "data",
        fromDate: cursor,
        toDate: chunkEnd,
        ...saved,
      });
      index++;
      cursor = nextDay(chunkEnd);
    }
  }

  const manifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    company: options.company,
    fromDate: options.fromDate,
    toDate: options.toDate,
    segments,
  };
  await writeFile(root + "/manifest.json", JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}
