import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { sb, type StockSummaryRow } from "@/lib/inventory";
import { buildReorderSuggestions } from "@/lib/inventory-reorder";

export const Route = createFileRoute("/_app/inventory/reorder")({
  head: () => ({
    meta: [
      { title: "Reorder Status | Mattress Maestro ERP" },
      { name: "description", content: "Items at or below reorder level with suggested order quantities." },
    ],
  }),
  component: ReorderPage,
});

function ReorderPage() {
  const q = useQuery({
    queryKey: ["stock_summary_reorder"],
    queryFn: async () => {
      const { data, error } = await sb.from("stock_summary").select("*").order("name");
      if (error) throw error;
      return data as StockSummaryRow[];
    },
  });

  const result = useMemo(() => {
    const rows = q.data ?? [];
    return buildReorderSuggestions(
      rows.map((r) => {
        const hasMax = r.max_stock != null && Number(r.max_stock) > 0;
        return {
          itemId: r.stock_item_id,
          itemName: r.code ? `${r.name} [${r.code}]` : r.name,
          unit: r.unit,
          onHand: Number(r.current_qty) || 0,
          // On-order supply is not yet a verified planning contract on this view.
          onOrder: 0,
          reorderLevel: Number(r.reorder_level) || 0,
          maxLevel: hasMax ? Number(r.max_stock) : null,
          // When max is absent, suggest the shortfall to reach reorder level as a fixed qty.
          reorderQty: hasMax
            ? null
            : Math.max(0, (Number(r.reorder_level) || 0) - (Number(r.current_qty) || 0)),
          policy: hasMax ? ("min_max" as const) : ("reorder_point" as const),
        };
      }),
    );
  }, [q.data]);

  const suggestions = result.suggestions;

  return (
    <>
      <PageHeader
        title="Reorder Status"
        description={`${suggestions.length} item(s) need attention. Suggestions use on-hand quantity only; open purchase supply is not netted until that contract is verified.`}
        actions={
          <Button variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching} className="min-h-11">
            <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <PageBody className="space-y-4">
        {q.isError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <span>{q.error instanceof Error ? q.error.message : "Could not load stock summary."}</span>
          </div>
        )}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5 text-right">On Hand</th>
                  <th className="px-4 py-2.5 text-right">Reorder Level</th>
                  <th className="px-4 py-2.5 text-right">Suggested Order</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {q.isLoading && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading stock summary…
                    </td>
                  </tr>
                )}
                {!q.isLoading &&
                  suggestions.map((s) => (
                    <tr key={s.itemId} className="hover:bg-muted/40 bg-destructive/5">
                      <td className="px-4 py-2 font-medium">{s.itemName}</td>
                      <td className="px-4 py-2">{s.unit}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.onHand}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.reorderLevel}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-destructive font-medium">
                        {s.suggestedOrderQty}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs">{s.reason}</td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          to="/inventory/movements"
                          search={{ item: s.itemId }}
                          className="text-xs text-primary hover:underline"
                        >
                          Movements →
                        </Link>
                      </td>
                    </tr>
                  ))}
                {!q.isLoading && suggestions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      All items are above reorder level, or no reorder levels are configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
        {result.skippedInvalid > 0 && (
          <p className="text-xs text-muted-foreground">
            Skipped {result.skippedInvalid} row(s) with invalid quantities or incomplete reorder policy.
          </p>
        )}
      </PageBody>
    </>
  );
}
