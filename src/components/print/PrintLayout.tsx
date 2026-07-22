import { ReactNode, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { COMPANY } from "@/lib/print-config";

export type PrintVariant = "classic" | "modern" | "minimal";

interface PrintLayoutProps {
  /** Document title used in browser tab and PDF filename. */
  title: string;
  /** Top-right label, e.g. "Tax Invoice" / "Purchase Bill" / "Statement of Account". */
  docLabel: string;
  /** Meta rows shown under the doc label, e.g. [["Invoice #", "INV-001"], ...]. */
  meta?: Array<[string, string]>;
  children: ReactNode;
  /** Optional footer notes below the page footer block. */
  footerNotes?: ReactNode;
  /** Visual template. Defaults to "classic". */
  variant?: PrintVariant;
}


/**
 * Shared printable shell. Print button opens the OS print dialog where the
 * user can pick any installed printer or "Save as PDF" / "Microsoft Print to
 * PDF". Browsers do not expose printer enumeration to web apps — the native
 * dialog is the supported path.
 */
export function PrintLayout({ title, docLabel, meta = [], children, footerNotes }: PrintLayoutProps) {
  const router = useRouter();

  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);

  return (
    <div className="print-root min-h-screen bg-muted/30">
      {/* Screen-only toolbar */}
      <div className="no-print sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-[210mm] items-center justify-between px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="text-sm text-muted-foreground">
            Choose any installed printer or "Save as PDF" in the print dialog.
          </div>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Printable page */}
      <div className="mx-auto my-6 max-w-[210mm] bg-white text-black shadow print:my-0 print:shadow-none">
        <div className="page p-10 print:p-8">
          {/* Header */}
          <header className="flex items-start justify-between border-b-2 border-black pb-4">
            <div>
              <div className="text-2xl font-bold">{COMPANY.name}</div>
              <div className="text-xs text-gray-600">{COMPANY.tagline}</div>
              <div className="mt-2 text-xs leading-snug text-gray-700">
                {COMPANY.address.map((l) => (
                  <div key={l}>{l}</div>
                ))}
                <div>GSTIN: {COMPANY.gstin} &nbsp;·&nbsp; State: {COMPANY.state} ({COMPANY.stateCode})</div>
                <div>{COMPANY.phone} &nbsp;·&nbsp; {COMPANY.email}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-block border border-black px-3 py-1 text-sm font-semibold uppercase tracking-wider">
                {docLabel}
              </div>
              {meta.length > 0 && (
                <table className="mt-3 ml-auto text-xs">
                  <tbody>
                    {meta.map(([k, v]) => (
                      <tr key={k}>
                        <td className="pr-3 text-right text-gray-600">{k}</td>
                        <td className="text-left font-medium">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </header>

          {/* Body */}
          <main className="mt-5 text-sm">{children}</main>

          {/* Footer */}
          <footer className="mt-8 border-t pt-4 text-xs text-gray-700">
            {footerNotes}
            <div className="mt-4 grid grid-cols-2 gap-6">
              <div>
                <div className="mb-1 font-semibold">Bank Details</div>
                <div>{COMPANY.bank.name} — {COMPANY.bank.branch}</div>
                <div>A/c Name: {COMPANY.bank.accountName}</div>
                <div>A/c No: {COMPANY.bank.accountNumber} &nbsp;·&nbsp; IFSC: {COMPANY.bank.ifsc}</div>
              </div>
              <div className="text-right">
                <div className="mb-10">For {COMPANY.name}</div>
                <div className="border-t border-gray-400 pt-1 text-gray-600">Authorised Signatory</div>
              </div>
            </div>
            <div className="mt-4 text-center text-[10px] text-gray-500">
              This is a system-generated document.
            </div>
          </footer>
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .print-root { background: white !important; }
          .page { box-shadow: none !important; }
          thead { display: table-header-group; }
          tr, td, th { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
