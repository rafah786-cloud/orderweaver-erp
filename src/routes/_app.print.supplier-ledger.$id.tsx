import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PrintLayout } from "@/components/print/PrintLayout";
import { PartyBlock, PrintTable, Th, Td } from "@/components/print/print-tables";
import { inr, formatDate } from "@/lib/format";
import { z } from "zod";

const search = z.object({ from: z.string().optional(), to: z.string().optional() });

export const Route = createFileRoute("/_app/print/supplier-ledger/$id")({
  component: PrintSupplierLedger,
  validateSearch: (s) => search.parse(s),
});

function PrintSupplierLedger() {
  const { id } = Route.useParams();
  const { from, to } = useSearch({ from: Route.id });

  const { data, isLoading, error } = useQuery({
    queryKey: ["print-supplier-ledger", id, from, to],
    queryFn: async () => {
      const { data: sup, error: e1 } = await supabase
        .from("suppliers")
        .select("name, address, gstin, phone, email, opening_balance, current_balance")
        .eq("id", id).single();
      if (e1) throw e1;
      let q = supabase.from("supplier_ledger_entries")
        .select("*").eq("supplier_id", id).order("entry_date", { ascending: true });
      if (from) q = q.gte("entry_date", from);
      if (to) q = q.lte("entry_date", to);
      const { data: entries, error: e2 } = await q;
      if (e2) throw e2;
      return { sup, entries: entries ?? [] };
    },
  });

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-10 text-center text-destructive">Ledger not found.</div>;

  const { sup, entries } = data;
  const opening = Number(sup.opening_balance ?? 0);
  let running = opening;
  const rows = entries.map((e: any) => {
    running = running + Number(e.debit) - Number(e.credit);
    return { ...e, running };
  });
  const totalDr = entries.reduce((s: number, e: any) => s + Number(e.debit), 0);
  const totalCr = entries.reduce((s: number, e: any) => s + Number(e.credit), 0);

  return (
    <PrintLayout
      title={`Ledger — ${sup.name}`}
      docLabel="Supplier Statement"
      meta={[
        ["Supplier", sup.name],
        ["Period", `${from ? formatDate(from) : "Inception"} → ${to ? formatDate(to) : formatDate(new Date().toISOString().slice(0, 10))}`],
        ["Closing Balance", inr(sup.current_balance ?? running)],
      ]}
    >
      <div className="grid grid-cols-2 gap-3">
        <PartyBlock
          title="Account"
          name={sup.name}
          address={sup.address}
          gstin={sup.gstin}
          contact={[sup.phone, sup.email].filter(Boolean).join(" · ")}
        />
        <div className="rounded border border-gray-300 p-3 text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Summary</div>
          <div className="flex justify-between"><span>Opening Balance</span><span className="font-medium">{inr(opening)}</span></div>
          <div className="flex justify-between"><span>Total Debits</span><span className="font-medium">{inr(totalDr)}</span></div>
          <div className="flex justify-between"><span>Total Credits</span><span className="font-medium">{inr(totalCr)}</span></div>
          <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Closing Balance</span><span>{inr(running)}</span></div>
        </div>
      </div>

      <PrintTable>
        <thead>
          <tr>
            <Th className="w-24">Date</Th>
            <Th className="w-24">Voucher</Th>
            <Th>Particulars</Th>
            <Th className="w-24 text-right">Debit</Th>
            <Th className="w-24 text-right">Credit</Th>
            <Th className="w-28 text-right">Balance</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>{from ? formatDate(from) : "—"}</Td>
            <Td>—</Td>
            <Td className="italic text-gray-600">Opening Balance</Td>
            <Td /><Td />
            <Td className="text-right font-medium">{inr(opening)}</Td>
          </tr>
          {rows.map((e: any) => (
            <tr key={e.id}>
              <Td>{formatDate(e.entry_date)}</Td>
              <Td>{[e.voucher_type, e.voucher_number].filter(Boolean).join(" ") || "—"}</Td>
              <Td>{e.narration ?? "—"}</Td>
              <Td className="text-right">{Number(e.debit) ? inr(e.debit) : ""}</Td>
              <Td className="text-right">{Number(e.credit) ? inr(e.credit) : ""}</Td>
              <Td className="text-right">{inr(e.running)}</Td>
            </tr>
          ))}
          {rows.length === 0 && <tr><Td className="text-center text-gray-500" >No entries in this period.</Td></tr>}
          <tr className="bg-gray-100 font-semibold">
            <Td /><Td />
            <Td className="text-right">Totals</Td>
            <Td className="text-right">{inr(totalDr)}</Td>
            <Td className="text-right">{inr(totalCr)}</Td>
            <Td className="text-right">{inr(running)}</Td>
          </tr>
        </tbody>
      </PrintTable>
    </PrintLayout>
  );
}
