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

// The XML bridge supports the Units collection already used by the ERP's
// Tally folder-scanner. Keep JSONEx on the explicitly mapped/verified set
// until its native Unit collection identifier has an official fixture.
export const XML_MASTER_COLLECTIONS = [...MASTER_COLLECTIONS, "List of Units"] as const;

// Only these JSONEx collection identifiers are explicitly demonstrated in
// Tally's official JSON integration guide. Other master IDs fail closed until
// an official sample or capture from a supported TallyPrime release confirms them.
export const JSONEX_MASTER_COLLECTIONS = ["List of Ledgers", "List of Stock Items"] as const;

export type SnapshotOptions = TallyRequestOptions & {
  outputDir: string;
  includeDayBook: boolean;
  chunkMonths: number;
};

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateSnapshotOptions(options: SnapshotOptions): void {
  if (!options.company.trim()) throw new Error("An explicit Tally company is required for snapshot export.");
  if (!options.fromDate || !options.toDate || !isValidIsoDate(options.fromDate) || !isValidIsoDate(options.toDate)) {
    throw new Error("Snapshot dates must be valid calendar dates in YYYY-MM-DD format.");
  }
  if (options.fromDate > options.toDate) throw new Error("Snapshot from-date must be on or before to-date.");
  if (!Number.isSafeInteger(options.chunkMonths) || options.chunkMonths < 1 || options.chunkMonths > 120) {
    throw new Error("Snapshot chunk months must be a whole number from 1 to 120.");
  }
  if (options.format !== undefined && options.format !== "XML" && options.format !== "JSONEx") {
    throw new Error("Snapshot format must be XML or JSONEx.");
  }
}

function shiftMonths(date: string, months: number): string {
  // setUTCMonth() overflows dates such as January 31 into March. Clamp to the
  // target month's final day before subtracting one day so export windows are
  // contiguous and cannot silently grow past the configured chunk size.
  const source = new Date(date + "T00:00:00Z");
  const targetMonth = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const targetYear = targetMonth.getUTCFullYear();
  const targetMonthIndex = targetMonth.getUTCMonth();
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(source.getUTCDate(), lastTargetDay);
  const exclusive = new Date(Date.UTC(targetYear, targetMonthIndex, targetDay));
  exclusive.setUTCDate(exclusive.getUTCDate() - 1);
  return exclusive.toISOString().slice(0, 10);
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
  validateSnapshotOptions(options);
  const format = options.format ?? "XML";
  const companySlug = options.company.replace(/[^a-z0-9._-]+/gi, "_");
  // JSONEx is a new path, so a stable hash suffix prevents two distinct Tally
  // company names that sanitize to the same Windows-safe slug from overwriting
  // each other's raw financial source snapshots. Keep the legacy XML path stable.
  const companyFolder = format === "JSONEx"
    ? companySlug + "-" + createHash("sha256").update(options.company, "utf8").digest("hex").slice(0, 10)
    : companySlug;
  // Keep JSONEx evidence separate from the established XML staging folder.
  const root = format === "JSONEx"
    ? options.outputDir + "/jsonex/" + companyFolder
    : options.outputDir + "/" + companyFolder;
  const extension = format === "JSONEx" ? ".json" : ".xml";
  await mkdir(root, { recursive: true });
  const segments: any[] = [];

  const collections = format === "XML" ? XML_MASTER_COLLECTIONS : JSONEX_MASTER_COLLECTIONS;
  for (const collection of collections) {
    const requestOptions = { ...options, requestType: "Collection" as const };
    const response = await client.request(
      collection,
      collectionRequest(collection, requestOptions),
      requestOptions,
    );
    segments.push({
      name: collection,
      kind: "collection",
      ...(await save(
        root,
        "master-" + collection.toLowerCase().replace(/[^a-z0-9]+/g, "-") + extension,
        response.body,
      )),
    });
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
        requestType: "Data" as const,
      };
      const response = await client.request(
        "DayBook",
        dataRequest("DayBook", requestOptions),
        requestOptions,
      );
      segments.push({
        name: "DayBook",
        kind: "data",
        fromDate: cursor,
        toDate: chunkEnd,
        ...(await save(
          root,
          "daybook-" + String(index).padStart(4, "0") + "-" + cursor + "-" + chunkEnd + extension,
          response.body,
        )),
      });
      index++;
      cursor = nextDay(chunkEnd);
    }
  }

  const manifest = {
    schemaVersion: 1,
    format,
    // JSONEx is only a supported-source subset until all master collection identifiers
    // and canonical ERP mappings have been verified. Never imply complete coverage.
    sourceCoverage: format === "JSONEx" ? "partial" : "configured-subset",
    requestedMasterCollections: collections,
    stagingCompatible: format === "XML",
    generatedAt: new Date().toISOString(),
    company: options.company,
    fromDate: options.fromDate,
    toDate: options.toDate,
    segments,
  };
  await writeFile(root + "/manifest.json", JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}
