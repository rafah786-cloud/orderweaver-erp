import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sb, type StockSummaryRow } from "@/lib/inventory";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_app/inventory/summary")({ component: StockSummaryPage });

function StockSummaryPage() {
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["stock_summary"],
    queryFn: async () => {
      const { data, error } = await sb.from("stock_summary").select("*").order("name");
      if (error) throw error;
      return data as StockSummaryRow[];
    },
  });

  const rows = useMemo(() => {
    const all = q.data ?? [];
    if (!search.trim()) return all;
    const s = search.toLowerCase();
    return all.filter((r) => r.name.toLowerCase().includes(s) || r.code?.toLowerCase().includes(s));
  }, [q.data, search]);

  const totalValue = rows.reduce((sum, r) => sum + (r.stock_value || 0), 0);

  return (
    <>
      <PageHeader title="Stock Summary" description={`${rows.length} items · Total value ${inr(totalValue)}`} />
      <PageBody>
        <div className="mb-4 max-w-md">
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-right">Avg Rate</th>
                  <th className="px-4 py-2.5 text-right">Value</th>
                  <th className="px-4 py-2.5 text-right">Reorder</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const low = r.current_qty <= r.reorder_level && r.reorder_level > 0;
                  return (
                    <tr key={r.stock_item_id} className={`hover:bg-muted/40 ${low ? "bg-destructive/5" : ""}`}>
                      <td className="px-4 py-2">{r.name} {r.code && <span className="text-xs text-muted-foreground ml-1">[{r.code}]</span>}</td>
                      <td className="px-4 py-2">{r.unit}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.current_qty}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{inr(r.avg_rate || 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{inr(r.stock_value || 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{r.reorder_level}</td>
                      <td className="px-4 py-2 text-right">
                        <Link to="/inventory/movements" search={{ item: r.stock_item_id }} className="text-xs text-primary hover:underline">
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !q.isLoading && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No items.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
