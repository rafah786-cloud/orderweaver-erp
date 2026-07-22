import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PrintLayout, type PrintVariant } from "@/components/print/PrintLayout";
import { PartyBlock, PrintTable, Th, Td } from "@/components/print/print-tables";
import { inr, formatDate } from "@/lib/format";

const templateSchema = z.object({
  template: z.enum(["classic", "modern", "minimal"]).optional(),
});

export const Route = createFileRoute("/_app/print/purchase/$id")({
  validateSearch: (s) => templateSchema.parse(s),
  component: PrintPurchase,
});

function PrintPurchase() {
  const { id } = Route.useParams();
  const { template } = Route.useSearch();
  const variant: PrintVariant = template ?? (typeof window !== "undefined" ? (localStorage.getItem("invoice_template") as PrintVariant) : null) ?? "classic";


  const { data, isLoading, error } = useQuery({
    queryKey: ["print-purchase", id],
    queryFn: async () => {
      const { data: bill, error: e1 } = await supabase
        .from("purchase_bills").select("*").eq("id", id).single();
      if (e1) throw e1;
      const { data: items, error: e2 } = await supabase
        .from("purchase_bill_items")
        .select("id, quantity, unit_price, amount, raw_material_id, raw_materials(name, unit)")
        .eq("purchase_bill_id", id);
      if (e2) throw e2;
      const sup = bill.supplier_id
        ? (await supabase.from("suppliers")
            .select("name, address, gstin, phone, email").eq("id", bill.supplier_id).single()).data
        : null;
      return { bill, items: items ?? [], sup };
    },
  });

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-10 text-center text-destructive">Bill not found.</div>;

  const { bill, items, sup } = data;
  const subtotal = items.reduce((s: number, it: any) => s + Number(it.amount ?? Number(it.quantity) * Number(it.unit_price)), 0);

  return (
    <PrintLayout
      variant={variant}
      title={`Purchase Bill ${bill.bill_number}`}
      docLabel="Purchase Bill"
      meta={[
        ["Bill #", bill.bill_number],
        ["Date", formatDate(bill.bill_date)],
      ]}
      footerNotes={bill.notes ? <div><span className="font-semibold">Notes: </span>{bill.notes}</div> : null}
    >
      <div className="grid grid-cols-2 gap-3">
        <PartyBlock
          title="Supplier"
          name={sup?.name}
          address={sup?.address}
          gstin={sup?.gstin}
          contact={[sup?.phone, sup?.email].filter(Boolean).join(" · ")}
        />
        <div className="rounded border border-gray-300 p-3 text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Received At</div>
          <div className="font-semibold">Main Warehouse</div>
          <div className="text-gray-700">Stock auto-posted to raw-material inventory.</div>
        </div>
      </div>

      <PrintTable>
        <thead>
          <tr>
            <Th className="w-8">#</Th>
            <Th>Material</Th>
            <Th className="w-20">Unit</Th>
            <Th className="w-16 text-right">Qty</Th>
            <Th className="w-24 text-right">Rate</Th>
            <Th className="w-28 text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any, i: number) => (
            <tr key={it.id}>
              <Td>{i + 1}</Td>
              <Td>{it.raw_materials?.name ?? "—"}</Td>
              <Td>{it.raw_materials?.unit ?? "—"}</Td>
              <Td className="text-right">{Number(it.quantity)}</Td>
              <Td className="text-right">{inr(it.unit_price)}</Td>
              <Td className="text-right">{inr(it.amount ?? Number(it.quantity) * Number(it.unit_price))}</Td>
            </tr>
          ))}
          {items.length === 0 && <tr><Td className="text-center text-gray-500" >No items.</Td></tr>}
        </tbody>
      </PrintTable>

      <div className="mt-4 grid grid-cols-2 gap-6">
        <div />
        <table className="w-full text-xs">
          <tbody>
            <tr><td className="py-1 text-right text-gray-600">Subtotal</td><td className="w-28 py-1 text-right">{inr(subtotal)}</td></tr>
            <tr className="border-t border-black"><td className="py-1 text-right font-semibold">Total</td><td className="py-1 text-right font-semibold">{inr(bill.total_amount)}</td></tr>
          </tbody>
        </table>
      </div>
    </PrintLayout>
  );
}
