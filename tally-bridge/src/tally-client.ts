import { XMLParser } from "fast-xml-parser";

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

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function dateVariable(name: string, value?: string): string {
  return value ? "<" + name + ' TYPE="Date">' + escapeXml(value) + "</" + name + ">" : "";
}

/**
 * Company is always explicit. This prevents a request from accidentally
 * exporting whichever company happens to be active in the Tally UI.
 */
export function collectionRequest(collection: string, options: TallyRequestOptions): string {
  return "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST>" +
    "<TYPE>Collection</TYPE><ID>" + escapeXml(collection) + "</ID></HEADER><BODY><DESC><STATICVARIABLES>" +
    '<SVCURRENTCOMPANY TYPE="String">' + escapeXml(options.company) + "</SVCURRENTCOMPANY>" +
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>" +
    dateVariable("SVFROMDATE", options.fromDate) + dateVariable("SVTODATE", options.toDate) +
    "</STATICVARIABLES></DESC></BODY></ENVELOPE>";
}

export function dataRequest(report: string, options: TallyRequestOptions): string {
  return "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST>" +
    "<TYPE>Data</TYPE><ID>" + escapeXml(report) + "</ID></HEADER><BODY><DESC><STATICVARIABLES>" +
    '<SVCURRENTCOMPANY TYPE="String">' + escapeXml(options.company) + "</SVCURRENTCOMPANY>" +
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>" +
    dateVariable("SVFROMDATE", options.fromDate) + dateVariable("SVTODATE", options.toDate) +
    "</STATICVARIABLES></DESC></BODY></ENVELOPE>";
}

export class TallyClient {
  constructor(
    private readonly baseUrl = process.env.TALLY_URL || "http://127.0.0.1:9000",
    private readonly defaultTimeoutMs = Number(process.env.TALLY_TIMEOUT_MS || 120000),
  ) {}

  async ping(): Promise<void> {
    await this.request("List of Ledgers", collectionRequest("List of Ledgers", { company: "" }), {
      company: "",
    });
  }

  async request(requestName: string, xml: string, options: TallyRequestOptions): Promise<TallyResponse> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "text/xml;charset=UTF-8", "Cache-Control": "no-cache" },
      body: xml,
      signal: AbortSignal.timeout(options.timeoutMs || this.defaultTimeoutMs),
    });
    const responseXml = await response.text();
    if (!response.ok) throw new Error("Tally HTTP " + response.status + ": " + responseXml.slice(0, 500));

    let status = 1;
    try {
      const parsed = parser.parse(responseXml) as Record<string, any>;
      status = Number(parsed?.ENVELOPE?.HEADER?.STATUS ?? 1);
    } catch {}
    if (status < 0) throw new Error("Tally request " + requestName + " returned STATUS=" + status);

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
