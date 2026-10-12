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
    private readonly defaultTimeoutMs = Number(process.env.TALLY_TIMEOUT_MS || 1800000),
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
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    let response: Response | undefined;
    let responseXml = "";
    const maxAttempts = 3;

    // Large Tally master collections can take several minutes. Retry only
    // transient transport failures/timeouts; HTTP and Tally validation errors
    // remain hard failures. Every attempt is read-only.
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        response = await fetch(this.baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/xml;charset=UTF-8",
            "Cache-Control": "no-cache",
          },
          body: xml,
          signal: AbortSignal.timeout(timeoutMs),
        });
        responseXml = await response.text();
        break;
      } catch (error) {
        const err = error as Error;
        const transient = err?.name === "TimeoutError" || err instanceof TypeError;
        if (!transient || attempt === maxAttempts) {
          throw new Error(
            "Tally request " + requestName + " failed after " + attempt +
            " attempt(s) (timeout " + timeoutMs + " ms): " + (err?.message || String(error)),
            { cause: error },
          );
        }
        const delayMs = attempt * 2000;
        console.warn(
          "[tally-bridge] " + requestName + " transport failure on attempt " +
          attempt + "/" + maxAttempts + "; retrying in " + delayMs +
          " ms (timeout " + timeoutMs + " ms).",
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    if (!response) throw new Error("Tally request " + requestName + " returned no response.");
    if (!response.ok) {
      throw new Error("Tally HTTP " + response.status + ": " + responseXml.slice(0, 500));
    }

    let status = 1;
    try {
      const parsed = parser.parse(responseXml) as Record<string, any>;
      status = Number(parsed?.ENVELOPE?.HEADER?.STATUS ?? 1);
    } catch {}
    if (status < 0) {
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
