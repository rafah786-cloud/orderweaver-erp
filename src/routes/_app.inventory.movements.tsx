import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { sb, type StockItem, type StockMovement, MOVEMENT_LABEL } from "@/lib/inventory";
import { inr } from "@/lib/format";

const search = z.object({ item: z.string().optional() });

export const Route = createFileRoute("/_app/inventory/movements")({
  validateSearch: search,
  component: MovementsPage,
});

function MovementsPage() {
  const { item } = Route.useSearch();

  const itemsQ = useQuery({
    queryKey: ["stock_items_basic"],
    queryFn: async () => {
      const { data, error } = await sb.from("stock_items").select("id, name, unit");
      if (error) throw error;
      return data as Pick<StockItem, "id" | "name" | "unit">[];
    },
  });

  const movQ = useQuery({
    queryKey: ["stock_movements", item ?? "all"],
    queryFn: async () => {
      let qb = sb.from("stock_movements").select("*").order("movement_date", { ascending: false }).limit(500);
      if (item) qb = qb.eq("stock_item_id", item);
      const { data, error } = await qb;
      if (error) throw error;
      return data as StockMovement[];
    },
  });

  const itemMap = useMemo(() => {
    const m = new Map<string, { name: string; unit: string }>();
    for (const i of itemsQ.data ?? []) m.set(i.id, { name: i.name, unit: i.unit });
    return m;
  }, [itemsQ.data]);

  return (
    <>
      <PageHeader title="Stock Movements" description={item ? `Filtered to selected item` : "Last 500 movements"} />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-right">Rate</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(movQ.data ?? []).map((m) => {
                  const info = itemMap.get(m.stock_item_id);
                  return (
                    <tr key={m.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2 tabular-nums">{m.movement_date}</td>
                      <td className="px-4 py-2 text-xs">{MOVEMENT_LABEL[m.movement_type]}</td>
                      <td className="px-4 py-2">{info?.name ?? m.stock_item_id}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${m.quantity < 0 ? "text-destructive" : "text-emerald-600"}`}>
                        {m.quantity} {info?.unit ?? ""}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{inr(m.rate || 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{inr(m.amount || 0)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {m.voucher_id ? (
                          <Link to="/accounting/voucher/$id" params={{ id: m.voucher_id }} className="text-primary hover:underline">
                            Voucher
                          </Link>
                        ) : m.narration ?? (m.source_table ?? "—")}
                      </td>
                    </tr>
                  );
                })}
                {(movQ.data ?? []).length === 0 && !movQ.isLoading && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No movements.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
