import { XMLParser, XMLValidator } from "fast-xml-parser";

export type TallyExportFormat = "XML" | "JSONEx";

export type TallyRequestOptions = {
  company: string;
  fromDate?: string;
  toDate?: string;
  timeoutMs?: number;
  /** Defaults to XML for backward compatibility. JSONEx export is read-only. */
  format?: TallyExportFormat;
};

export type TallyResponse = {
  company: string;
  requestName: string;
  requestedAt: string;
  status: number;
  format: TallyExportFormat;
  /** Exact response text retained without parsing/re-serializing source data. */
  body: string;
  bytes: number;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function dateVariable(name: string, value?: string): string {
  return value ? "<" + name + ' TYPE="Date">' + escapeXml(value) + "</" + name + ">" : "";
}

function jsonExDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("JSONEx date filters must use YYYY-MM-DD.");
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("JSONEx date filters must be valid calendar dates.");
  }
  return match[1] + match[2] + match[3];
}

/**
 * TallyPrime 7.0+ JSONEx export request payload. This bridge deliberately
 * builds only Export requests; it has no native JSON import/post operation.
 * The HTTP metadata (version/tallyrequest/type/id) is supplied by TallyClient.
 */
function jsonExRequest(options: TallyRequestOptions): string {
  if (!options.company.trim()) throw new Error("JSONEx export requires an explicit Tally company name.");
  const static_variables: Array<{ name: string; value: string }> = [
    { name: "svExportFormat", value: "JSONEx" },
    { name: "svCurrentCompany", value: options.company },
  ];
  if (options.fromDate) static_variables.push({ name: "SVFROMDATE", value: jsonExDate(options.fromDate) });
  if (options.toDate) static_variables.push({ name: "SVTODATE", value: jsonExDate(options.toDate) });
  return JSON.stringify({ static_variables });
}

/**
 * Company is always explicit in both protocols. This prevents a request from
 * accidentally exporting whichever company happens to be active in Tally.
 */
export function collectionRequest(collection: string, options: TallyRequestOptions): string {
  if (options.format === "JSONEx") return jsonExRequest(options);
  return (
    "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST>" +
    "<TYPE>Collection</TYPE><ID>" +
    escapeXml(collection) +
    "</ID></HEADER><BODY><DESC><STATICVARIABLES>" +
    '<SVCURRENTCOMPANY TYPE="String">' +
    escapeXml(options.company) +
    "</SVCURRENTCOMPANY>" +
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>" +
    dateVariable("SVFROMDATE", options.fromDate) +
    dateVariable("SVTODATE", options.toDate) +
    "</STATICVARIABLES></DESC></BODY></ENVELOPE>"
  );
}

export function dataRequest(report: string, options: TallyRequestOptions): string {
  if (options.format === "JSONEx") return jsonExRequest(options);
  return (
    "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST>" +
    "<TYPE>Data</TYPE><ID>" +
    escapeXml(report) +
    "</ID></HEADER><BODY><DESC><STATICVARIABLES>" +
    '<SVCURRENTCOMPANY TYPE="String">' +
    escapeXml(options.company) +
    "</SVCURRENTCOMPANY>" +
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>" +
    dateVariable("SVFROMDATE", options.fromDate) +
    dateVariable("SVTODATE", options.toDate) +
    "</STATICVARIABLES></DESC></BODY></ENVELOPE>"
  );
}

export class TallyClient {
  constructor(
    private readonly baseUrl = process.env.TALLY_URL || "http://127.0.0.1:9000",
    private readonly defaultTimeoutMs = Number(process.env.TALLY_TIMEOUT_MS || 120000),
  ) {}

  async ping(): Promise<void> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "Cache-Control": "no-cache",
      },
      body: "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Ledgers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></DESC></BODY></ENVELOPE>",
      signal: AbortSignal.timeout(this.defaultTimeoutMs),
    });
    if (!response.ok) throw new Error("Tally HTTP " + response.status);
  }

  async request(
    requestName: string,
    requestBody: string,
    options: TallyRequestOptions,
  ): Promise<TallyResponse> {
    const format = options.format ?? "XML";
    const jsonEx = format === "JSONEx";
    const requestType = requestName === "DayBook" ? "Data" : "Collection";
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": jsonEx ? "application/json" : "text/xml;charset=UTF-8",
        ...(jsonEx ? {
          Version: "1",
          Tallyrequest: "Export",
          Type: requestType,
          Id: requestName,
        } : {}),
        "Cache-Control": "no-cache",
      },
      body: requestBody,
      signal: AbortSignal.timeout(options.timeoutMs || this.defaultTimeoutMs),
    });
    const responseBody = await response.text();
    if (!response.ok) throw new Error("Tally HTTP " + response.status);

    let status: number;
    if (jsonEx) {
      let parsed: Record<string, unknown>;
      try {
        const value: unknown = JSON.parse(responseBody);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
        parsed = value as Record<string, unknown>;
      } catch {
        throw new Error("Tally returned malformed JSONEx response.");
      }
      const rawStatus = parsed.status;
      status = rawStatus === "1" || rawStatus === 1 ? 1 : rawStatus === "0" || rawStatus === 0 ? 0 : Number.NaN;
      if (status !== 1) {
        const safeStatus = rawStatus === undefined ? "missing" : String(rawStatus).slice(0, 32);
        throw new Error("Tally request " + requestName + " returned JSON status=" + safeStatus);
      }
    } else {
      if (/<!DOCTYPE|<!ENTITY/i.test(responseBody) || XMLValidator.validate(responseBody) !== true) {
        throw new Error("Tally returned malformed XML or unsupported document entities");
      }
      const parsed = parser.parse(responseBody) as Record<string, any>;
      if (!parsed?.ENVELOPE) throw new Error("Tally response has no ENVELOPE");
      status = Number(parsed.ENVELOPE.HEADER?.STATUS ?? 1);
      if (!Number.isFinite(status) || status <= 0 || /<LINEERROR[\s>]/i.test(responseBody)) {
        throw new Error("Tally request " + requestName + " returned STATUS=" + status);
      }
    }

    return {
      company: options.company,
      requestName,
      requestedAt: new Date().toISOString(),
      status,
      format,
      body: responseBody,
      bytes: Buffer.byteLength(responseBody, "utf8"),
    };
  }
}
