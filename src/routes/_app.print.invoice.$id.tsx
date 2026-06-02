import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PrintLayout } from "@/components/print/PrintLayout";
import { PartyBlock, PrintTable, Th, Td } from "@/components/print/print-tables";
import { COMPANY } from "@/lib/print-config";
import { inr, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/print/invoice/$id")({
  component: PrintInvoice,
});

function PrintInvoice() {
  const { id } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["print-invoice", id],
    queryFn: async () => {
      const { data: inv, error: e1 } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .single();
      if (e1) throw e1;
      const { data: items, error: e2 } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", id);
      if (e2) throw e2;
      const { data: party, error: e3 } = await supabase
        .from("parties")
        .select("name, address, gstin, phone, email, state_code, pin_code, contact_person")
        .eq("id", inv.party_id)
        .single();
      if (e3) throw e3;
      return { inv, items: items ?? [], party };
    },
  });

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-10 text-center text-destructive">Invoice not found.</div>;

  const { inv, items, party } = data;
  const isInterState = (party.state_code ?? "") && party.state_code !== COMPANY.stateCode;
  const balance = Number(inv.total_amount) - Number(inv.paid_amount);

  return (
    <PrintLayout
      title={`Invoice ${inv.invoice_number}`}
      docLabel="Tax Invoice"
      meta={[
        ["Invoice #", inv.invoice_number],
        ["Date", formatDate(inv.invoice_date)],
        ...(inv.due_date ? ([["Due Date", formatDate(inv.due_date)]] as Array<[string, string]>) : []),
        ["Status", inv.status.toUpperCase()],
      ]}
      footerNotes={
        <div>
          <div className="mb-1 font-semibold">Terms &amp; Conditions</div>
          <ol className="ml-4 list-decimal space-y-0.5">
            {COMPANY.terms.map((t) => (<li key={t}>{t}</li>))}
          </ol>
          {inv.notes && <div className="mt-2"><span className="font-semibold">Notes: </span>{inv.notes}</div>}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <PartyBlock
          title="Bill To"
          name={party.name}
          address={party.address}
          gstin={party.gstin}
          stateCode={party.state_code}
          contact={[party.contact_person, party.phone, party.email].filter(Boolean).join(" · ")}
        />
        <PartyBlock
          title="Ship To"
          name={party.name}
          address={party.address}
          gstin={party.gstin}
          stateCode={party.state_code}
        />
      </div>

      <PrintTable>
        <thead>
          <tr>
            <Th className="w-8">#</Th>
            <Th>Description</Th>
            <Th className="w-20">HSN</Th>
            <Th className="w-16 text-right">Qty</Th>
            <Th className="w-24 text-right">Rate</Th>
            <Th className="w-16 text-right">GST %</Th>
            <Th className="w-28 text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any, i: number) => (
            <tr key={it.id}>
              <Td>{i + 1}</Td>
              <Td>{it.description}</Td>
              <Td>{it.hsn_code ?? "—"}</Td>
              <Td className="text-right">{Number(it.quantity)}</Td>
              <Td className="text-right">{inr(it.unit_price)}</Td>
              <Td className="text-right">{Number(it.tax_rate)}%</Td>
              <Td className="text-right">{inr(it.amount ?? Number(it.quantity) * Number(it.unit_price))}</Td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><Td className="text-center text-gray-500" >No line items.</Td></tr>
          )}
        </tbody>
      </PrintTable>

      <div className="mt-4 grid grid-cols-2 gap-6">
        <div />
        <table className="w-full text-xs">
          <tbody>
            <tr><td className="py-1 text-right text-gray-600">Subtotal</td><td className="w-28 py-1 text-right">{inr(inv.subtotal)}</td></tr>
            {isInterState ? (
              <tr><td className="py-1 text-right text-gray-600">IGST</td><td className="py-1 text-right">{inr(inv.tax_amount)}</td></tr>
            ) : (
              <>
                <tr><td className="py-1 text-right text-gray-600">CGST</td><td className="py-1 text-right">{inr(Number(inv.tax_amount) / 2)}</td></tr>
                <tr><td className="py-1 text-right text-gray-600">SGST</td><td className="py-1 text-right">{inr(Number(inv.tax_amount) / 2)}</td></tr>
              </>
            )}
            <tr className="border-t border-black"><td className="py-1 text-right font-semibold">Total</td><td className="py-1 text-right font-semibold">{inr(inv.total_amount)}</td></tr>
            <tr><td className="py-1 text-right text-gray-600">Paid</td><td className="py-1 text-right">{inr(inv.paid_amount)}</td></tr>
            <tr className="border-t"><td className="py-1 text-right font-semibold">Balance Due</td><td className="py-1 text-right font-semibold">{inr(balance)}</td></tr>
          </tbody>
        </table>
      </div>
    </PrintLayout>
  );
}
