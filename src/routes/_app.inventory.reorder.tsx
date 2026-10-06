import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { sb, type StockSummaryRow } from "@/lib/inventory";

export const Route = createFileRoute("/_app/inventory/reorder")({ component: ReorderPage });

function ReorderPage() {
  const q = useQuery({
    queryKey: ["stock_summary_reorder"],
    queryFn: async () => {
      const { data, error } = await sb.from("stock_summary").select("*").order("name");
      if (error) throw error;
      return data as StockSummaryRow[];
    },
  });

  const low = (q.data ?? []).filter((r) => r.reorder_level > 0 && r.current_qty <= r.reorder_level);

  return (
    <>
      <PageHeader
        title="Reorder Status"
        description={`${low.length} items at or below reorder level`}
      />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5 text-right">On Hand</th>
                  <th className="px-4 py-2.5 text-right">Reorder Level</th>
                  <th className="px-4 py-2.5 text-right">Shortfall</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {low.map((r) => (
                  <tr key={r.stock_item_id} className="hover:bg-muted/40 bg-destructive/5">
                    <td className="px-4 py-2">
                      {r.name}{" "}
                      {r.code && (
                        <span className="text-xs text-muted-foreground ml-1">[{r.code}]</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{r.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.current_qty}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.reorder_level}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-destructive">
                      {r.reorder_level - r.current_qty}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        to="/inventory/movements"
                        search={{ item: r.stock_item_id }}
                        className="text-xs text-primary hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {low.length === 0 && !q.isLoading && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      All items above reorder level.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
