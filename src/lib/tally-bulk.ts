import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import { parseTallyMasters } from "./tally-import";
import { inspectTallyAccounting } from "./tally-integrity";

export const TALLY_SOURCES = ["ABOOD TRADINGS", "ABRAZ SLEEPING SOLUTIONS", "ABZ - EST", "ESTIMATE"] as const;
export const NORMALIZATION_VERSION = "tally-import-only-v1";
export const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
export type NormalizationChange = { offset: number; original: string; replacement: string };
const forbidden = (code: number) => code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31);

/** Evidence is never rewritten: this derivative is exclusively for import parsing. */
export function normalizeTallyImportXml(original: string, inheritedNamespaces = "") {
  if (/<!DOCTYPE|<!ENTITY/i.test(original)) throw new Error("Document types and external entities are forbidden.");
  const changes: NormalizationChange[] = [];
  // eslint-disable-next-line no-control-regex -- intentional import-only detection, with every replacement audited
  let xml = original.replace(/&#(?:x([0-9a-f]+)|(\d+));|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gi, (match, hex, decimal, offset) => {
    const code = hex ? parseInt(hex, 16) : decimal ? Number(decimal) : match.charCodeAt(0);
    if (!forbidden(code)) return match;
    const replacement = `[TALLY_CONTROL_U+${code.toString(16).toUpperCase().padStart(4, "0")}]`;
    changes.push({ offset, original: match, replacement });
    return replacement;
  });
  // Preserve declarations inherited from the source envelope in the derivative only.
  for (const declaration of inheritedNamespaces.matchAll(/xmlns:([\w.-]+)\s*=\s*("[^"]*"|'[^']*')/g)) {
    if (!new RegExp(`xmlns:${declaration[1]}\\s*=`).test(xml)) {
      const start = xml.search(/<TALLYMESSAGE\b/);
      const replacement = ` ${declaration[0]}`;
      xml = xml.replace(/<TALLYMESSAGE\b/, `<TALLYMESSAGE${replacement}`);
      changes.push({ offset: start, original: "", replacement });
    }
  }
  // Each extracted message is independently parseable. Keep existing namespace values intact.
  if (/<\/?UDF:|\sUDF:[\w.-]+\s*=/.test(xml) && !/xmlns:UDF\s*=/.test(xml)) {
    const start = xml.search(/<TALLYMESSAGE\b/);
    if (start < 0) throw new Error("UDF namespace repair requires a TALLYMESSAGE root.");
    xml = xml.replace(/<TALLYMESSAGE\b/, '<TALLYMESSAGE xmlns:UDF="TallyUDF"');
    changes.push({ offset: start, original: "", replacement: ' xmlns:UDF="TallyUDF"' });
  }
  for (const match of xml.matchAll(/<\/?([A-Za-z_][\w.-]*):/g)) {
    if (!new RegExp(`xmlns:${match[1]}\\s*=`).test(xml)) throw new Error(`Undeclared namespace ${match[1]} is not supported.`);
  }
  if (XMLValidator.validate(xml) !== true) throw new Error("Malformed or truncated Tally message.");
  return { xml, changes, version: NORMALIZATION_VERSION };
}

export async function sha256(bytes: BufferSource) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
export const hashText = (text: string) => sha256(new TextEncoder().encode(text));
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, parseAttributeValue: false, trimValues: false });
const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const list = (value: unknown): Record<string, unknown>[] => value == null ? [] : (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
export type BulkRow = {
  recordType: string; sourceId: string | null; alterId: string | null; masterId: string | null;
  lifecycle: string; rawXml: string; normalizedXml: string; normalization: NormalizationChange[];
  payload: Record<string, unknown>; debit: number; credit: number; inventoryLines: number; billAllocations: number;
  errors: string[];
};

export function prepareTallyMessage(rawXml: string, inheritedNamespaces = ""): BulkRow[] {
  if (new TextEncoder().encode(rawXml).length > MAX_MESSAGE_BYTES) throw new Error("A source message exceeds 16 MB; re-export smaller records.");
  const normalized = normalizeTallyImportXml(rawXml, inheritedNamespaces);
  const root = parser.parse(normalized.xml).TALLYMESSAGE as Record<string, unknown>;
  if (!root) throw new Error("Missing TALLYMESSAGE root.");
  const rows: BulkRow[] = [];
  for (const [recordType, value] of Object.entries(root)) {
    if (recordType.startsWith("@_") || recordType === "#text") continue;
    for (const payload of list(value)) {
      if (!payload || typeof payload !== "object") throw new Error("Invalid source record.");
      const sourceId = text(payload.GUID ?? payload.REMOTEID ?? payload["@_REMOTEID"]) || null;
      const alterId = text(payload.ALTERID ?? payload["@_ALTERID"]) || null;
      const masterId = text(payload.MASTERID) || null;
      const yes = (v: unknown) => text(v).toLowerCase() === "yes";
      const lifecycle = yes(payload.ISDELETED) || text(payload["@_ACTION"]).toLowerCase() === "delete" ? "deleted" : yes(payload.ISCANCELLED ?? payload.CANCELLED) ? "cancelled" : yes(payload.ISOPTIONAL) ? "optional" : "posted";
      const errors: string[] = [];
      if (!sourceId) errors.push("Missing GUID/REMOTEID; source record quarantined.");
      if (!alterId || !/^\d+$/.test(alterId)) errors.push("Missing or invalid ALTERID; change tracking unavailable.");
      let debit = 0, credit = 0, inventoryLines = 0, billAllocations = 0;
      if (recordType === "VOUCHER") {
        const attributes = Object.fromEntries(Object.entries(root).filter(([key]) => key.startsWith("@_")));
        const singleVoucher = builder.build({ TALLYMESSAGE: { ...attributes, VOUCHER: payload } });
        const parsed = parseTallyMasters(`<ENVELOPE><BODY><DATA>${singleVoucher}</DATA></BODY></ENVELOPE>`, { rawGroups: [], finishedGroups: [], preserveLifecycle: true });
        const totals = inspectTallyAccounting(parsed);
        errors.push(...totals.errors);
        debit = lifecycle === "posted" ? totals.debit : 0;
        credit = lifecycle === "posted" ? totals.credit : 0;
        inventoryLines = parsed.vouchers.reduce((n, v) => n + v.inventory_entries.length, 0);
        billAllocations = parsed.bills.length;
        for (const voucher of parsed.vouchers) {
          if (!voucher.voucher_date || !voucher.voucher_type) errors.push("Missing voucher date/type.");
        }
      }
      rows.push({ recordType, sourceId, alterId, masterId, lifecycle, rawXml, normalizedXml: normalized.xml, normalization: normalized.changes, payload, debit, credit, inventoryLines, billAllocations, errors });
    }
  }
  if (!rows.length) throw new Error("Settings/report XML is not masters data: no source records.");
  return rows;
}

export type BulkSummary = {
  company: string; companyGuid: string | null; files: number; rows: number; vouchers: number; debit: number; credit: number;
  inventoryLines: number; billAllocations: number; missingIds: number; duplicates: number; rejects: number;
  normalized: number; byType: Record<string, number>; lifecycle: Record<string, number>; blockers: string[];
};
export function newBulkSummary(company: string): BulkSummary {
  return { company, companyGuid: null, files: 0, rows: 0, vouchers: 0, debit: 0, credit: 0, inventoryLines: 0, billAllocations: 0, missingIds: 0, duplicates: 0, rejects: 0, normalized: 0, byType: {}, lifecycle: {}, blockers: [] };
}
export function sourceCompleteness(summary: BulkSummary): string[] {
  const gaps = ["GROUP", "LEDGER", "STOCKITEM", "GODOWN", "COSTCENTRE", "UNIT"].filter((kind) => !summary.byType[kind]);
  return [
    ...gaps.map((kind) => `Complete ${kind} masters export missing (empty collections require verified source evidence).`),
    ...(!summary.companyGuid ? ["Source company GUID is not verified."] : []),
    ...(!summary.vouchers ? ["No voucher history supplied; a masters-only bundle is not a complete accounting migration."] : []),
    ...(summary.rejects || summary.duplicates || summary.missingIds ? ["Resolve source rejects, duplicate identities and missing identifiers before cloud staging."] : []),
  ];
}

/** Streaming message extraction keeps memory bounded by a source message, not a complete file. */
export async function* tallyMessages(chunks: AsyncIterable<string>): AsyncGenerator<{ message?: string; header?: string; footer?: string }> {
  let buffer = "", started = false, found = false, cursor = 0, header = "";
  for await (const chunk of chunks) {
    buffer += chunk;
    if (/<!DOCTYPE|<!ENTITY/i.test(buffer)) throw new Error("Document entities are forbidden.");
    while (true) {
      const start = buffer.indexOf("<", cursor);
      if (start < 0) { cursor = buffer.length; break; }
      const tail = buffer.slice(start);
      // Comments/CDATA may contain tag-looking text; never use them as boundaries.
      const token = tail.startsWith("<!--") ? tail.match(/^<!--[\s\S]*?-->/)?.[0]
        : tail.startsWith("<![CDATA[") ? tail.match(/^<!\[CDATA\[[\s\S]*?\]\]>/)?.[0]
        : tail.match(/^<(?:[^>"']|"[^"]*"|'[^']*')*>/)?.[0];
      if (!token) { cursor = start; break; }
      cursor = start + token.length;
      if (/^<TALLYMESSAGE\b/.test(token)) {
        if (started) throw new Error("Nested TALLYMESSAGE is unsupported.");
        if (token.endsWith("/>")) throw new Error("Empty TALLYMESSAGE is not source data.");
        const outside = buffer.slice(0, start);
        if (!found) { header = outside; yield { header }; }
        else if (outside.trim()) throw new Error("Unexpected content between Tally messages.");
        buffer = buffer.slice(start); cursor -= start; started = true; found = true;
      } else if (/^<\/TALLYMESSAGE\s*>$/.test(token)) {
        if (!started) throw new Error("Unexpected TALLYMESSAGE closing tag.");
        yield { message: buffer.slice(0, cursor) };
        buffer = buffer.slice(cursor); cursor = 0; started = false;
      }
    }
    if (new TextEncoder().encode(buffer).length > MAX_MESSAGE_BYTES) throw new Error("Source message/header exceeds bounded parser limit.");
  }
  if (started) throw new Error("Truncated TALLYMESSAGE; file quarantined.");
  if (!found) throw new Error("No masters/vouchers: Tally Import Data settings screen is not an export.");
  if (!/^\s*(?:<\/REQUESTDATA>\s*<\/IMPORTDATA>|<\/DATA>)\s*<\/BODY>\s*<\/ENVELOPE>\s*$/.test(buffer)) throw new Error("Incomplete or unsupported Tally export envelope.");
  if (XMLValidator.validate(header + buffer) !== true) throw new Error("Malformed source envelope.");
  yield { footer: buffer };
}