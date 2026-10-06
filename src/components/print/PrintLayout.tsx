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
export function PrintLayout({ title, docLabel, meta = [], children, footerNotes, variant = "classic" }: PrintLayoutProps) {
  const router = useRouter();

  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);

  const isModern = variant === "modern";
  const isMinimal = variant === "minimal";
  const accent = isModern ? "#7c3aed" : isMinimal ? "#111827" : "#000000";

  const headerClass = isModern
    ? "flex items-start justify-between rounded-md px-5 py-4 text-white"
    : isMinimal
      ? "flex items-start justify-between pb-3"
      : "flex items-start justify-between border-b-2 border-black pb-4";
  const headerStyle = isModern ? { background: accent } : undefined;
  const docLabelClass = isModern
    ? "inline-block rounded bg-white px-3 py-1 text-sm font-semibold uppercase tracking-wider text-gray-900"
    : isMinimal
      ? "inline-block text-lg font-semibold uppercase tracking-[0.2em] text-gray-800"
      : "inline-block border border-black px-3 py-1 text-sm font-semibold uppercase tracking-wider";
  const companyNameClass = isModern
    ? "text-2xl font-bold text-white"
    : isMinimal
      ? "text-3xl font-light tracking-tight text-gray-900"
      : "text-2xl font-bold";
  const infoTextClass = isModern ? "text-white/85" : "text-gray-700";
  const taglineClass = isModern ? "text-white/80" : "text-gray-600";

  return (
    <div className="print-root min-h-screen bg-muted/30">
      {/* Screen-only toolbar */}
      <div className="no-print sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-[210mm] items-center justify-between px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="text-sm text-muted-foreground">
            Template: <span className="font-medium capitalize">{variant}</span> — pick another via <code className="text-xs">?template=classic|modern|minimal</code>
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
          <header className={headerClass} style={headerStyle}>
            <div>
              <div className={companyNameClass}>{COMPANY.name}</div>
              <div className={`text-xs ${taglineClass}`}>{COMPANY.tagline}</div>
              <div className={`mt-2 text-xs leading-snug ${infoTextClass}`}>
                {COMPANY.address.map((l) => (
                  <div key={l}>{l}</div>
                ))}
                <div>GSTIN: {COMPANY.gstin} &nbsp;·&nbsp; State: {COMPANY.state} ({COMPANY.stateCode})</div>
                <div>{[COMPANY.phone, COMPANY.email].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <div className="text-right">
              <div className={docLabelClass}>
                {docLabel}
              </div>
              {meta.length > 0 && (
                <table className="mt-3 ml-auto text-xs">
                  <tbody>
                    {meta.map(([k, v]) => (
                      <tr key={k}>
                        <td className={`pr-3 text-right ${isModern ? "text-white/85" : "text-gray-600"}`}>{k}</td>
                        <td className={`text-left font-medium ${isModern ? "text-white" : ""}`}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </header>

          {isMinimal && <div className="mt-2 h-px bg-gray-300" />}


          {/* Body */}
          <main className="mt-5 text-sm">{children}</main>

          {/* Footer */}
          <footer className="mt-8 border-t pt-4 text-xs text-gray-700">
            {footerNotes}
            <div className={`mt-4 grid gap-6 ${COMPANY.bank.name ? "grid-cols-2" : "grid-cols-1"}`}>
              {COMPANY.bank.name && (
              <div>
                <div className="mb-1 font-semibold">Bank Details</div>
                <div>{COMPANY.bank.name} — {COMPANY.bank.branch}</div>
                <div>A/c Name: {COMPANY.bank.accountName}</div>
                <div>A/c No: {COMPANY.bank.accountNumber} &nbsp;·&nbsp; IFSC: {COMPANY.bank.ifsc}</div>
              </div>
              )}
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
