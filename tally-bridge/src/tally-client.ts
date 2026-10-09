import { XMLParser, XMLValidator } from "fast-xml-parser";

export type TallyRequestOptions = {
  company: string;
  fromDate?: string;
  toDate?: string;
  timeoutMs?: number;
};

export type TallyResponse = {
  company: string;
  requestName: string;
  requestedAt: string;
  status: number;
  xml: string;
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

/**
 * Company is always explicit. This prevents a request from accidentally
 * exporting whichever company happens to be active in the Tally UI.
 */
export function collectionRequest(collection: string, options: TallyRequestOptions): string {
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
    xml: string,
    options: TallyRequestOptions,
  ): Promise<TallyResponse> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "Cache-Control": "no-cache",
      },
      body: xml,
      signal: AbortSignal.timeout(options.timeoutMs || this.defaultTimeoutMs),
    });
    const responseXml = await response.text();
    if (!response.ok) {
      throw new Error("Tally HTTP " + response.status + ": " + responseXml.slice(0, 500));
    }

    if (/<!DOCTYPE|<!ENTITY/i.test(responseXml) || XMLValidator.validate(responseXml) !== true) {
      throw new Error("Tally returned malformed XML or unsupported document entities");
    }
    const parsed = parser.parse(responseXml) as Record<string, any>;
    if (!parsed?.ENVELOPE) throw new Error("Tally response has no ENVELOPE");
    const status = Number(parsed.ENVELOPE.HEADER?.STATUS ?? 1);
    if (!Number.isFinite(status) || status <= 0 || /<LINEERROR[\s>]/i.test(responseXml)) {
      throw new Error("Tally request " + requestName + " returned STATUS=" + status);
    }

    return {
      company: options.company,
      requestName,
      requestedAt: new Date().toISOString(),
      status,
      xml: responseXml,
      bytes: Buffer.byteLength(responseXml, "utf8"),
    };
  }
}
