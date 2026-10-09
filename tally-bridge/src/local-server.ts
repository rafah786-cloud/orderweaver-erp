import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { TallyClient, collectionRequest, dataRequest } from "./tally-client.js";
import { MASTER_COLLECTIONS } from "./snapshot.js";

export type BridgeConfig = { allowedOrigin: string; pairingKey: string; client: TallyClient };
export function authorizeLocalRequest(req: IncomingMessage, config: BridgeConfig): boolean {
  const origin = req.headers.origin;
  const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const expected = Buffer.from(config.pairingKey);
  const supplied = Buffer.from(token);
  return origin === config.allowedOrigin && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function companies(client: TallyClient) {
  // Standard read-only collection export. Missing GUIDs are a blocker, never invented.
  const response = await client.request("List of Companies", collectionRequest("List of Companies", { company: "" }), { company: "" });
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false }).parse(response.xml);
  const result: Array<{ name: string; guid: string }> = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const [key, child] of Object.entries(node)) {
      if (key === "COMPANY") {
        const list = Array.isArray(child) ? child : [child];
        for (const c of list) {
          if (!c || typeof c !== "object") continue;
          const name = String(c["@_NAME"] ?? c.NAME ?? "").trim();
          const guid = String(c.GUID ?? "").trim();
          if (!name || !guid) throw new Error("Tally company export lacks NAME/GUID. Export company identities for this Tally release before using live import.");
          result.push({ name, guid });
        }
      } else walk(child);
    }
  }
  walk(parsed);
  if (!result.length) throw new Error("No identifiable Tally companies returned. Load the company in TallyPrime or use exported XML.");
  if (new Set(result.map((c) => c.guid)).size !== result.length) throw new Error("Tally returned duplicate company GUIDs.");
  return result;
}

export function createLocalBridge(config: BridgeConfig) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Exact loopback host guards DNS rebinding; no wildcard CORS or filesystem input.
    if (req.headers.host !== "127.0.0.1:9010" || req.headers.origin !== config.allowedOrigin) {
      res.writeHead(403).end(); return;
    }
    res.setHeader("Access-Control-Allow-Origin", config.allowedOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.writeHead(204).end(); return;
    }
    if (!authorizeLocalRequest(req, config)) { res.writeHead(401).end(); return; }
    res.setHeader("Content-Type", "application/json");
    try {
      if (req.method !== "GET") { res.writeHead(405).end(); return; }
      const url = new URL(req.url ?? "/", "http://127.0.0.1:9010");
      if (url.pathname === "/companies") {
        res.end(JSON.stringify({ protocol: 1, companies: await companies(config.client), checkedAt: new Date().toISOString() })); return;
      }
      if (url.pathname !== "/export") { res.writeHead(404).end(); return; }
      const guid = url.searchParams.get("companyGuid");
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      const date = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
      if (!date(from) || !date(to) || from > to || !guid || guid.length > 255) throw new Error("Choose a company GUID and valid ordered date range.");
      const list = await companies(config.client);
      const company = list.find((c) => c.guid === guid);
      if (!company) throw new Error("Selected Tally company GUID is unavailable.");
      if (list.filter((c) => c.name === company.name).length !== 1) throw new Error("Multiple loaded companies share this name. This Tally name-qualified export cannot safely distinguish them; unload the other identity or use company-qualified XML.");
      const kind = url.searchParams.get("kind") ?? "DayBook";
      const permitted = [...MASTER_COLLECTIONS, "List of Units", "DayBook"] as readonly string[];
      if (!permitted.includes(kind)) throw new Error("Unsupported export collection.");
      const options = { company: company.name, fromDate: from, toDate: to };
      const response = await config.client.request(kind, kind === "DayBook" ? dataRequest(kind, options) : collectionRequest(kind, options), options);
      if (response.bytes > 20 * 1024 * 1024) throw new Error("Export exceeds 20 MB. Choose a smaller date range.");
      const after = await companies(config.client);
      if (!after.some((c) => c.guid === guid && c.name === company.name)) throw new Error("Company identity changed during export. Nothing was accepted.");
      res.end(JSON.stringify({ protocol: 1, company, kind, from, to, xml: response.xml, exportedAt: response.requestedAt }));
    } catch (error) {
      res.writeHead(422).end(JSON.stringify({ error: error instanceof Error ? error.message : "Local Tally export failed" }));
    }
  });
}