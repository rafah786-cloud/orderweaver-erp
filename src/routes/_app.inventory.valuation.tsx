import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sb, VALUATION_LABEL, type ValuationMethod } from "@/lib/inventory";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_app/inventory/valuation")({ component: ValuationPage });

type ItemRow = {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  valuation_method: ValuationMethod;
  standard_cost: number;
};

type MovementRow = {
  stock_item_id: string;
  godown_id: string | null;
  movement_date: string;
  quantity: number;
  rate: number;
  amount: number;
};

type GodownRow = { id: string; name: string };

type Lot = { qty: number; rate: number; date: string };

type ValueCell = { qty: number; value: number; rate: number };

function valueLots(lots: Lot[]): { qty: number; value: number } {
  let qty = 0, value = 0;
  for (const l of lots) { qty += l.qty; value += l.qty * l.rate; }
  return { qty, value };
}

function computeItemGodown(
  movs: MovementRow[],
  method: ValuationMethod,
  standardCost: number,
): Record<string, ValueCell> {
  // group by godown
  const byG: Record<string, MovementRow[]> = {};
  for (const m of movs) {
    const g = m.godown_id ?? "__none";
    (byG[g] ||= []).push(m);
  }
  const out: Record<string, ValueCell> = {};
  for (const [g, list] of Object.entries(byG)) {
    list.sort((a, b) => a.movement_date.localeCompare(b.movement_date));
    if (method === "weighted_avg") {
      let qty = 0, value = 0;
      for (const m of list) {
        if (m.quantity > 0) {
          qty += m.quantity;
          value += m.quantity * m.rate;
        } else if (m.quantity < 0) {
          const avg = qty > 0 ? value / qty : 0;
          value += m.quantity * avg;
          qty += m.quantity;
          if (qty <= 0) { qty = 0; value = 0; }
        }
      }
      out[g] = { qty, value, rate: qty > 0 ? value / qty : 0 };
    } else if (method === "standard_cost") {
      let qty = 0;
      for (const m of list) qty += m.quantity;
      out[g] = { qty, value: qty * standardCost, rate: standardCost };
    } else {
      // FIFO / LIFO
      const lots: Lot[] = [];
      for (const m of list) {
        if (m.quantity > 0) {
          lots.push({ qty: m.quantity, rate: m.rate, date: m.movement_date });
        } else if (m.quantity < 0) {
          let remaining = -m.quantity;
          while (remaining > 0 && lots.length > 0) {
            const idx = method === "fifo" ? 0 : lots.length - 1;
            const lot = lots[idx];
            const take = Math.min(lot.qty, remaining);
            lot.qty -= take;
            remaining -= take;
            if (lot.qty <= 0) lots.splice(idx, 1);
          }
        }
      }
      const { qty, value } = valueLots(lots);
      out[g] = { qty, value, rate: qty > 0 ? value / qty : 0 };
    }
  }
  return out;
}

function ValuationPage() {
  const [methodOverride, setMethodOverride] = useState<ValuationMethod | "per_item">("per_item");
  const [search, setSearch] = useState("");

  const itemsQ = useQuery({
    queryKey: ["inv_val_items"],
    queryFn: async () => {
      const { data, error } = await sb.from("stock_items")
        .select("id,name,code,unit,valuation_method,standard_cost").eq("is_active", true).order("name");
      if (error) throw error;
      return data as ItemRow[];
    },
  });

  const godownsQ = useQuery({
    queryKey: ["inv_val_godowns"],
    queryFn: async () => {
      const { data, error } = await sb.from("godowns").select("id,name").eq("is_active", true).order("name");
      if (error) throw error;
      return data as GodownRow[];
    },
  });

  const movsQ = useQuery({
    queryKey: ["inv_val_movs"],
    queryFn: async () => {
      const { data, error } = await sb.from("stock_movements")
        .select("stock_item_id,godown_id,movement_date,quantity,rate,amount");
      if (error) throw error;
      return data as MovementRow[];
    },
  });

  const { rows, godownTotals, grandTotal } = useMemo(() => {
    const items = itemsQ.data ?? [];
    const movs = movsQ.data ?? [];
    const godowns = godownsQ.data ?? [];
    const byItem: Record<string, MovementRow[]> = {};
    for (const m of movs) (byItem[m.stock_item_id] ||= []).push(m);

    const s = search.trim().toLowerCase();
    const filtered = items.filter((it) =>
      !s || it.name.toLowerCase().includes(s) || it.code?.toLowerCase().includes(s)
    );

    const rows = filtered.map((it) => {
      const method = methodOverride === "per_item" ? it.valuation_method : methodOverride;
      const cells = computeItemGodown(byItem[it.id] ?? [], method, it.standard_cost || 0);
      let totalQty = 0, totalValue = 0;
      for (const c of Object.values(cells)) { totalQty += c.qty; totalValue += c.value; }
      return { item: it, method, cells, totalQty, totalValue };
    });

    const godownTotals: Record<string, number> = {};
    let grandTotal = 0;
    for (const r of rows) {
      for (const g of godowns) {
        const v = r.cells[g.id]?.value ?? 0;
        godownTotals[g.id] = (godownTotals[g.id] ?? 0) + v;
      }
      grandTotal += r.totalValue;
    }
    return { rows, godownTotals, grandTotal };
  }, [itemsQ.data, movsQ.data, godownsQ.data, methodOverride, search]);

  const godowns = godownsQ.data ?? [];
  const loading = itemsQ.isLoading || movsQ.isLoading || godownsQ.isLoading;

  return (
    <>
      <PageHeader
        title="Stock Valuation"
        description={`Per-godown & overall inventory value · Grand total ${inr(grandTotal)}`}
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <div className="w-64">
            <Select value={methodOverride} onValueChange={(v) => setMethodOverride(v as typeof methodOverride)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_item">Per item (as configured)</SelectItem>
                <SelectItem value="weighted_avg">{VALUATION_LABEL.weighted_avg}</SelectItem>
                <SelectItem value="fifo">{VALUATION_LABEL.fifo}</SelectItem>
                <SelectItem value="lifo">{VALUATION_LABEL.lifo}</SelectItem>
                <SelectItem value="standard_cost">{VALUATION_LABEL.standard_cost}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-64">
            <Input placeholder="Search item..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5">Method</th>
                  {godowns.map((g) => (
                    <th key={g.id} className="px-4 py-2.5 text-right whitespace-nowrap">{g.name}</th>
                  ))}
                  <th className="px-4 py-2.5 text-right">Total Qty</th>
                  <th className="px-4 py-2.5 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.item.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2">
                      {r.item.name}
                      {r.item.code && <span className="text-xs text-muted-foreground ml-1">[{r.item.code}]</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{VALUATION_LABEL[r.method]}</td>
                    {godowns.map((g) => {
                      const c = r.cells[g.id];
                      return (
                        <td key={g.id} className="px-4 py-2 text-right tabular-nums">
                          {c && c.qty !== 0 ? (
                            <>
                              <div>{inr(c.value)}</div>
                              <div className="text-xs text-muted-foreground">{c.qty} {r.item.unit}</div>
                            </>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right tabular-nums">{r.totalQty} {r.item.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{inr(r.totalValue)}</td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr><td colSpan={3 + godowns.length} className="text-center py-8 text-muted-foreground">No items.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-muted/30 border-t font-medium">
                  <tr>
                    <td className="px-4 py-2.5" colSpan={2}>Godown totals</td>
                    {godowns.map((g) => (
                      <td key={g.id} className="px-4 py-2.5 text-right tabular-nums">{inr(godownTotals[g.id] ?? 0)}</td>
                    ))}
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{inr(grandTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
