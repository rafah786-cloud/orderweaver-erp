import { ArrowLeft, Printer } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import zizzLogo from "@/assets/brands/zizz.png.asset.json";
import { COMPANY } from "@/lib/print-config";
import { amountInIndianWords } from "@/lib/amount-in-words";
import { formatDate } from "@/lib/format";

type InvoiceItem = {
  id: string;
  description: string;
  hsn_code: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number | null;
  amount: number | null;
};

type InvoiceRecord = {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  notes: string | null;
};

type PartyRecord = {
  name: string;
  address: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  state_code: string | null;
  pin_code: string | null;
  contact_person: string | null;
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function PartyDetails({ label, party }: { label: string; party: PartyRecord }) {
  return (
    <section className="ref-party">
      <div className="ref-label">{label}</div>
      <strong>{party.name || "Cash"}</strong>
      {party.address && <div className="ref-preline">{party.address}</div>}
      {party.pin_code && <div>PIN: {party.pin_code}</div>}
      {party.gstin && <div>GSTIN/UIN: {party.gstin}</div>}
      <div>State Code: {party.state_code || "—"}</div>
      {(party.contact_person || party.phone || party.email) && (
        <div>{[party.contact_person, party.phone, party.email].filter(Boolean).join(" · ")}</div>
      )}
    </section>
  );
}

function MetaCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="ref-meta-cell">
      <span>{label}</span>
      {value && <strong>{value}</strong>}
    </div>
  );
}

export function ReferenceInvoice({ invoice, items, party }: { invoice: InvoiceRecord; items: InvoiceItem[]; party: PartyRecord }) {
  const router = useRouter();
  const isInterState = Boolean(party.state_code && party.state_code !== COMPANY.stateCode);
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const taxableTotal = items.reduce((sum, item) => sum + Number(item.amount ?? Number(item.quantity) * Number(item.unit_price)), 0);
  const groupedTax = Array.from(items.reduce((groups, item) => {
    const taxable = Number(item.amount ?? Number(item.quantity) * Number(item.unit_price));
    const rate = Number(item.tax_rate ?? (taxable > 0 ? Number(invoice.tax_amount) / taxableTotal * 100 : 0));
    const key = `${item.hsn_code ?? "—"}|${rate}`;
    const current = groups.get(key) ?? { hsn: item.hsn_code ?? "—", rate, taxable: 0, tax: 0 };
    current.taxable += taxable;
    current.tax += taxable * rate / 100;
    groups.set(key, current);
    return groups;
  }, new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>()).values());

  return (
    <div className="ref-invoice-root">
      <div className="no-print ref-toolbar">
        <Button variant="ghost" size="sm" onClick={() => router.history.back()}><ArrowLeft className="h-4 w-4" />Back</Button>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / Save as PDF</Button>
      </div>

      <article className="ref-invoice-page">
        <h1>Tax Invoice</h1>
        <div className="ref-document">
          <div className="ref-upper-grid">
            <div className="ref-left-column">
              <header className="ref-company">
                <div className="ref-logo"><img src={zizzLogo.url} alt="Zizz" /></div>
                <div>
                  <strong>{COMPANY.name}</strong>
                  {COMPANY.address.map((line) => <div key={line}>{line}</div>)}
                  <div>GSTIN/UIN: {COMPANY.gstin}</div>
                  <div>State Name: {COMPANY.state}, Code: {COMPANY.stateCode}</div>
                  <div>E-Mail: {COMPANY.email}</div>
                </div>
              </header>
              <PartyDetails label="Consignee (Ship to)" party={party} />
              <PartyDetails label="Buyer (Bill to)" party={party} />
            </div>
            <div className="ref-meta-grid">
              <MetaCell label="Invoice No." value={invoice.invoice_number} />
              <MetaCell label="Dated" value={formatDate(invoice.invoice_date)} />
              <MetaCell label="Delivery Note" />
              <MetaCell label="Mode/Terms of Payment" value={invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : null} />
              <MetaCell label="Reference No. & Date." />
              <MetaCell label="Other References" />
              <MetaCell label="Buyer's Order No." />
              <MetaCell label="Dated" />
              <MetaCell label="Dispatch Doc No." />
              <MetaCell label="Delivery Note Date" />
              <MetaCell label="Dispatched through" />
              <MetaCell label="Destination" />
              <div className="ref-meta-cell ref-meta-wide"><span>Terms of Delivery</span></div>
            </div>
          </div>

          <table className="ref-items-table">
            <thead><tr><th>Sl<br />No.</th><th>Description of Goods</th><th>HSN/SAC</th><th>Quantity</th><th>Rate<br />(Incl. of Tax)</th><th>Rate</th><th>per</th><th>Disc. %</th><th>Amount</th></tr></thead>
            <tbody>
              {items.map((item, index) => {
                const rate = Number(item.tax_rate ?? 0);
                const amount = Number(item.amount ?? Number(item.quantity) * Number(item.unit_price));
                return <tr key={item.id}><td>{index + 1}</td><td><strong>{item.description}</strong></td><td>{item.hsn_code ?? "—"}</td><td className="ref-number"><strong>{money(item.quantity)} NOS</strong></td><td className="ref-number">{money(Number(item.unit_price) * (1 + rate / 100))}</td><td className="ref-number">{money(item.unit_price)}</td><td>NOS</td><td></td><td className="ref-number"><strong>{money(amount)}</strong></td></tr>;
              })}
              {items.length === 0 && <tr><td colSpan={9} className="ref-empty">No line items</td></tr>}
              <tr className="ref-tax-lines"><td></td><td><strong>{isInterState ? "IGST" : "CGST"}<br />{!isInterState && "SGST"}</strong></td><td colSpan={6}></td><td className="ref-number"><strong>{isInterState ? money(invoice.tax_amount) : <>{money(Number(invoice.tax_amount) / 2)}<br />{money(Number(invoice.tax_amount) / 2)}</>}</strong></td></tr>
            </tbody>
            <tfoot><tr><td colSpan={3} className="ref-number">Total</td><td className="ref-number"><strong>{money(totalQuantity)} NOS</strong></td><td colSpan={4}></td><td className="ref-number ref-grand-total">₹ {money(invoice.total_amount)}</td></tr></tfoot>
          </table>

          <section className="ref-words"><div><span>Amount Chargeable (in words)</span><i>E. & O.E</i></div><strong>{amountInIndianWords(Number(invoice.total_amount))}</strong></section>

          <table className="ref-tax-table">
            <thead>{isInterState ? <><tr><th rowSpan={2}>HSN/SAC</th><th rowSpan={2}>Taxable Value</th><th colSpan={2}>IGST</th><th rowSpan={2}>Total Tax Amount</th></tr><tr><th>Rate</th><th>Amount</th></tr></> : <><tr><th rowSpan={2}>HSN/SAC</th><th rowSpan={2}>Taxable Value</th><th colSpan={2}>CGST</th><th colSpan={2}>SGST/UTGST</th><th rowSpan={2}>Total Tax Amount</th></tr><tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr></>}</thead>
            <tbody>
              {groupedTax.map((row) => isInterState ? <tr key={`${row.hsn}-${row.rate}`}><td>{row.hsn}</td><td>{money(row.taxable)}</td><td>{money(row.rate)}%</td><td>{money(row.tax)}</td><td>{money(row.tax)}</td></tr> : <tr key={`${row.hsn}-${row.rate}`}><td>{row.hsn}</td><td>{money(row.taxable)}</td><td>{money(row.rate / 2)}%</td><td>{money(row.tax / 2)}</td><td>{money(row.rate / 2)}%</td><td>{money(row.tax / 2)}</td><td>{money(row.tax)}</td></tr>)}
              <tr className="ref-tax-total"><td>Total</td><td>{money(taxableTotal)}</td>{isInterState ? <><td></td><td>{money(invoice.tax_amount)}</td><td>{money(invoice.tax_amount)}</td></> : <><td></td><td>{money(Number(invoice.tax_amount) / 2)}</td><td></td><td>{money(Number(invoice.tax_amount) / 2)}</td><td>{money(invoice.tax_amount)}</td></>}</tr>
            </tbody>
          </table>

          <section className="ref-tax-words">Tax Amount (in words): <strong>{amountInIndianWords(Number(invoice.tax_amount))}</strong></section>
          {invoice.notes && <section className="ref-notes"><strong>Notes:</strong> {invoice.notes}</section>}
          <footer className="ref-signoff">
            <div><u>Declaration</u><p>{COMPANY.declaration}</p></div>
            <div><strong>for {COMPANY.name}</strong><span>Authorised Signatory</span></div>
          </footer>
        </div>
        <div className="ref-generated">This is a Computer Generated Invoice</div>
      </article>
    </div>
  );
}