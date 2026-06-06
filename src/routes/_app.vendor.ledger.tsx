import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_app/vendor/ledger")({ component: VendorLedger });

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN");

function VendorLedger() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["vendor-ledger", from, to],
    queryFn: async () => {
      let q = supabase.from("supplier_ledger_entries")
        .select("id, entry_date, voucher_type, voucher_number, debit, credit, narration")
        .order("entry_date");
      if (from) q = q.gte("entry_date", from);
      if (to) q = q.lte("entry_date", to);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    let bal = 0;
    return entries.map((e: any) => {
      bal += Number(e.credit ?? 0) - Number(e.debit ?? 0);
      return { ...e, balance: bal };
    });
  }, [entries]);

  const totalDebit = entries.reduce((s, e: any) => s + Number(e.debit ?? 0), 0);
  const totalCredit = entries.reduce((s, e: any) => s + Number(e.credit ?? 0), 0);

  const downloadCSV = () => {
    const header = ["Date", "Voucher Type", "Voucher #", "Narration", "Debit", "Credit", "Balance"];
    const lines = [header.join(",")].concat(
      rows.map((r) => [
        r.entry_date, r.voucher_type ?? "", r.voucher_number ?? "",
        `"${(r.narration ?? "").replace(/"/g, '""')}"`,
        r.debit, r.credit, r.balance,
      ].join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ledger-${from || "all"}-${to || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Ledger Statement</h1>
        <p className="text-sm text-muted-foreground">Your account with Zizz Mattress.</p>
      </div>
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">From</label>
            <input type="date" className="border rounded px-2 py-1 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">To</label>
            <input type="date" className="border rounded px-2 py-1 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={downloadCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No entries.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{fmt(r.entry_date)}</TableCell>
                    <TableCell className="text-xs">{r.voucher_type} {r.voucher_number}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.narration ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.debit ? inr(Number(r.debit)) : "—"}</TableCell>
                    <TableCell className="text-right">{r.credit ? inr(Number(r.credit)) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{inr(r.balance)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td className="p-3 text-sm font-medium" colSpan={3}>Total</td>
                  <td className="p-3 text-right font-medium">{inr(totalDebit)}</td>
                  <td className="p-3 text-right font-medium">{inr(totalCredit)}</td>
                  <td className="p-3 text-right font-medium">{inr(totalCredit - totalDebit)}</td>
                </tr>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
