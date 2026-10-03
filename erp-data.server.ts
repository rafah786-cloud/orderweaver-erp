import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Deterministic ERP metrics (server-only).
 *
 * Every number the AI layer talks about is computed here, in code, from the
 * real database — the model only ever explains figures it is handed. Nothing
 * in this file writes to the database, and every query runs through the
 * caller's RLS-scoped Supabase client, so a user can never see through AI
 * what they could not see in the UI.
 */

export type Db = SupabaseClient<Database>;

export interface Period {
  from: string; // yyyy-mm-dd inclusive
  to: string; // yyyy-mm-dd inclusive
}

const DAY = 86_400_000;

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  return iso(new Date(Date.now() - n * DAY));
}

export function defaultPeriod(days = 90): Period {
  return { from: daysAgo(days), to: iso(new Date()) };
}

export function previousPeriod(p: Period): Period {
  const from = new Date(p.from).getTime();
  const to = new Date(p.to).getTime();
  const span = Math.max(DAY, to - from);
  return { from: iso(new Date(from - span - DAY)), to: iso(new Date(from - DAY)) };
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round((Number.isFinite(n) ? n : 0) * f) / f;
}

function pct(current: number, previous: number): number | null {
  if (!previous) return null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Ordinary least squares over an evenly spaced series. */
export function linearForecast(series: number[], periodsAhead: number): { forecast: number[]; slope: number; r2: number } {
  const n = series.length;
  if (n < 3) return { forecast: [], slope: 0, r2: 0 };
  const xs = series.map((_, i) => i);
  const mx = sum(xs) / n;
  const my = sum(series) / n;
  const den = sum(xs.map((x) => (x - mx) ** 2));
  const slope = den === 0 ? 0 : sum(xs.map((x, i) => (x - mx) * (series[i]! - my))) / den;
  const intercept = my - slope * mx;
  const ssTot = sum(series.map((y) => (y - my) ** 2));
  const ssRes = sum(series.map((y, i) => (y - (intercept + slope * i)) ** 2));
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  const forecast = Array.from({ length: periodsAhead }, (_, k) =>
    round(Math.max(0, intercept + slope * (n + k))),
  );
  return { forecast, slope: round(slope), r2: round(r2, 3) };
}

/** Population z-score of the last point against its history. */
export function zScore(series: number[]): { z: number; mean: number; stdev: number } {
  if (series.length < 4) return { z: 0, mean: 0, stdev: 0 };
  const history = series.slice(0, -1);
  const mean = sum(history) / history.length;
  const variance = sum(history.map((v) => (v - mean) ** 2)) / history.length;
  const stdev = Math.sqrt(variance);
  const last = series[series.length - 1]!;
  return { z: stdev === 0 ? 0 : round((last - mean) / stdev, 2), mean: round(mean), stdev: round(stdev) };
}

/* ------------------------------------------------------------------ */
/* Sales & revenue                                                     */
/* ------------------------------------------------------------------ */

export async function salesSummary(db: Db, period: Period) {
  const prev = previousPeriod(period);
  const [{ data: current }, { data: previousRows }] = await Promise.all([
    db
      .from("invoices")
      .select("id, invoice_number, invoice_date, party_id, subtotal, tax_amount, total_amount, paid_amount, status")
      .gte("invoice_date", period.from)
      .lte("invoice_date", period.to)
      .neq("status", "cancelled")
      .order("invoice_date"),
    db
      .from("invoices")
      .select("total_amount, subtotal")
      .gte("invoice_date", prev.from)
      .lte("invoice_date", prev.to)
      .neq("status", "cancelled"),
  ]);

  const rows = current ?? [];
  const revenue = sum(rows.map((r) => Number(r.subtotal ?? 0)));
  const gross = sum(rows.map((r) => Number(r.total_amount ?? 0)));
  const prevRevenue = sum((previousRows ?? []).map((r) => Number(r.subtotal ?? 0)));

  const byMonth = new Map<string, { revenue: number; invoices: number }>();
  for (const r of rows) {
    const k = monthKey(r.invoice_date);
    const b = byMonth.get(k) ?? { revenue: 0, invoices: 0 };
    b.revenue += Number(r.subtotal ?? 0);
    b.invoices += 1;
    byMonth.set(k, b);
  }

  const partyIds = [...new Set(rows.map((r) => r.party_id).filter(Boolean))] as string[];
  const names = await partyNames(db, partyIds);
  const byParty = new Map<string, number>();
  for (const r of rows) {
    if (!r.party_id) continue;
    byParty.set(r.party_id, (byParty.get(r.party_id) ?? 0) + Number(r.subtotal ?? 0));
  }

  return {
    period,
    comparedWith: prev,
    invoiceCount: rows.length,
    netRevenue: round(revenue),
    grossWithTax: round(gross),
    taxCollected: round(sum(rows.map((r) => Number(r.tax_amount ?? 0)))),
    averageInvoiceValue: rows.length ? round(revenue / rows.length) : 0,
    previousPeriodRevenue: round(prevRevenue),
    revenueChangePct: pct(revenue, prevRevenue),
    monthly: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, revenue: round(v.revenue), invoices: v.invoices })),
    topCustomers: [...byParty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, v]) => ({ party: names.get(id) ?? "Unknown", revenue: round(v) })),
  };
}

async function partyNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await db.from("parties").select("id, name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

async function supplierNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await db.from("suppliers").select("id, name").in("id", ids);
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}

/* ------------------------------------------------------------------ */
/* Product & customer profitability                                    */
/* ------------------------------------------------------------------ */

/** Latest known purchase rate per raw material (falls back to the average). */
async function materialCostMap(db: Db): Promise<Map<string, number>> {
  const { data } = await db
    .from("purchase_bill_items")
    .select("raw_material_id, unit_price, purchase_bills(bill_date)")
    .order("id", { ascending: false })
    .limit(4000);
  const latest = new Map<string, { rate: number; date: string }>();
  for (const row of (data ?? []) as unknown as {
    raw_material_id: string;
    unit_price: number | null;
    purchase_bills: { bill_date: string } | null;
  }[]) {
    const date = row.purchase_bills?.bill_date ?? "";
    const prior = latest.get(row.raw_material_id);
    if (!prior || date > prior.date) latest.set(row.raw_material_id, { rate: Number(row.unit_price ?? 0), date });
  }
  return new Map([...latest.entries()].map(([k, v]) => [k, v.rate]));
}

/** Material cost of one unit of each product model, from its BOQ. */
async function modelCostMap(db: Db): Promise<Map<string, number>> {
  const [{ data: boq }, costs] = await Promise.all([
    db.from("model_boq").select("model_id, raw_material_id, quantity_per_unit"),
    materialCostMap(db),
  ]);
  const out = new Map<string, number>();
  for (const line of boq ?? []) {
    const cost = (costs.get(line.raw_material_id) ?? 0) * Number(line.quantity_per_unit ?? 0);
    out.set(line.model_id, (out.get(line.model_id) ?? 0) + cost);
  }
  return out;
}

export async function productProfitability(db: Db, period: Period) {
  const [{ data: items }, modelCosts, { data: models }] = await Promise.all([
    db
      .from("sales_order_items")
      .select("product_name, size, quantity, unit_price, amount, model_id, sales_orders!inner(order_date)")
      .gte("sales_orders.order_date", period.from)
      .lte("sales_orders.order_date", period.to),
    modelCostMap(db),
    db.from("product_models").select("id, name, code, size, default_price"),
  ]);

  const modelMeta = new Map((models ?? []).map((m) => [m.id, m]));
  type Agg = { name: string; qty: number; revenue: number; materialCost: number; hasCost: boolean; listPrice: number | null };
  const agg = new Map<string, Agg>();

  for (const row of (items ?? []) as unknown as {
    product_name: string;
    size: string | null;
    quantity: number;
    unit_price: number;
    amount: number | null;
    model_id: string | null;
  }[]) {
    const meta = row.model_id ? modelMeta.get(row.model_id) : undefined;
    const key = row.model_id ?? `${row.product_name}|${row.size ?? ""}`;
    const name = meta?.name ?? row.product_name;
    const qty = Number(row.quantity ?? 0);
    const revenue = Number(row.amount ?? qty * Number(row.unit_price ?? 0));
    const unitCost = row.model_id ? modelCosts.get(row.model_id) : undefined;
    const entry = agg.get(key) ?? {
      name,
      qty: 0,
      revenue: 0,
      materialCost: 0,
      hasCost: unitCost != null,
      listPrice: meta ? Number(meta.default_price ?? 0) : null,
    };
    entry.qty += qty;
    entry.revenue += revenue;
    entry.materialCost += (unitCost ?? 0) * qty;
    entry.hasCost = entry.hasCost || unitCost != null;
    agg.set(key, entry);
  }

  const products = [...agg.values()]
    .map((p) => {
      const margin = p.hasCost ? p.revenue - p.materialCost : null;
      return {
        product: p.name,
        quantitySold: round(p.qty, 3),
        revenue: round(p.revenue),
        averageSellingPrice: p.qty ? round(p.revenue / p.qty) : 0,
        listPrice: p.listPrice,
        discountVsListPct:
          p.listPrice && p.qty ? pct(p.revenue / p.qty, p.listPrice) : null,
        materialCost: p.hasCost ? round(p.materialCost) : null,
        grossMargin: margin == null ? null : round(margin),
        grossMarginPct: margin == null || !p.revenue ? null : round((margin / p.revenue) * 100, 1),
        costBasis: p.hasCost ? ("boq_latest_purchase_rate" as const) : ("unavailable" as const),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    period,
    note: "Margins use BOQ material cost valued at the latest purchase rate. Labour and overhead are excluded unless captured in the BOQ.",
    products: products.slice(0, 40),
    totals: {
      revenue: round(sum(products.map((p) => p.revenue))),
      materialCost: round(sum(products.map((p) => p.materialCost ?? 0))),
    },
  };
}

export async function customerProfitability(db: Db, period: Period) {
  const { data: orders } = await db
    .from("sales_orders")
    .select("id, party_id, order_date, total_amount, sales_order_items(quantity, amount, unit_price, model_id)")
    .gte("order_date", period.from)
    .lte("order_date", period.to);

  const modelCosts = await modelCostMap(db);
  const byParty = new Map<string, { revenue: number; cost: number; orders: number }>();
  for (const o of (orders ?? []) as unknown as {
    party_id: string;
    total_amount: number;
    sales_order_items: { quantity: number; amount: number | null; unit_price: number; model_id: string | null }[];
  }[]) {
    const entry = byParty.get(o.party_id) ?? { revenue: 0, cost: 0, orders: 0 };
    entry.orders += 1;
    for (const it of o.sales_order_items ?? []) {
      entry.revenue += Number(it.amount ?? Number(it.quantity) * Number(it.unit_price));
      entry.cost += (it.model_id ? modelCosts.get(it.model_id) ?? 0 : 0) * Number(it.quantity ?? 0);
    }
    byParty.set(o.party_id, entry);
  }
  const names = await partyNames(db, [...byParty.keys()]);
  return {
    period,
    customers: [...byParty.entries()]
      .map(([id, v]) => ({
        customer: names.get(id) ?? "Unknown",
        orders: v.orders,
        revenue: round(v.revenue),
        materialCost: round(v.cost),
        grossMargin: round(v.revenue - v.cost),
        grossMarginPct: v.revenue ? round(((v.revenue - v.cost) / v.revenue) * 100, 1) : null,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 25),
  };
}

/* ------------------------------------------------------------------ */
/* Receivables                                                         */
/* ------------------------------------------------------------------ */

export async function receivables(db: Db) {
  const today = iso(new Date());
  const { data } = await db
    .from("invoices")
    .select("id, invoice_number, invoice_date, due_date, party_id, total_amount, paid_amount, status")
    .in("status", ["unpaid", "partial"])
    .order("due_date", { nullsFirst: false });

  const rows = data ?? [];
  const names = await partyNames(db, [...new Set(rows.map((r) => r.party_id))]);
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  const detail = rows.map((r) => {
    const outstanding = Number(r.total_amount ?? 0) - Number(r.paid_amount ?? 0); // display projection; canonical outstanding is bill_outstanding()
    const due = r.due_date ?? r.invoice_date;
    const daysOverdue = Math.floor((new Date(today).getTime() - new Date(due).getTime()) / DAY);
    if (daysOverdue <= 0) buckets.current += outstanding;
    else if (daysOverdue <= 30) buckets.d1_30 += outstanding;
    else if (daysOverdue <= 60) buckets.d31_60 += outstanding;
    else if (daysOverdue <= 90) buckets.d61_90 += outstanding;
    else buckets.d90plus += outstanding;
    return {
      invoice: r.invoice_number,
      customer: names.get(r.party_id) ?? "Unknown",
      invoiceDate: r.invoice_date,
      dueDate: r.due_date,
      outstanding: round(outstanding),
      daysOverdue: Math.max(0, daysOverdue),
      status: r.status,
    };
  });

  return {
    asOf: today,
    totalOutstanding: round(sum(detail.map((d) => d.outstanding))),
    ageing: {
      current: round(buckets.current),
      "1-30": round(buckets.d1_30),
      "31-60": round(buckets.d31_60),
      "61-90": round(buckets.d61_90),
      "90+": round(buckets.d90plus),
    },
    overdue: detail.filter((d) => d.daysOverdue > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 25),
  };
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export async function inventoryIntelligence(db: Db, days = 90) {
  const from = daysAgo(days);
  const [{ data: materials }, { data: purchases }, { data: boqUsage }] = await Promise.all([
    db.from("raw_materials").select("id, code, name, unit, reorder_level"),
    db
      .from("purchase_bill_items")
      .select("raw_material_id, quantity, unit_price, purchase_bills!inner(bill_date)")
      .gte("purchase_bills.bill_date", from),
    db
      .from("sales_order_items")
      .select("quantity, model_id, sales_orders!inner(order_date)")
      .gte("sales_orders.order_date", from)
      .not("model_id", "is", null),
  ]);

  const { data: boq } = await db.from("model_boq").select("model_id, raw_material_id, quantity_per_unit");
  const consumption = new Map<string, number>();
  const boqByModel = new Map<string, { raw_material_id: string; quantity_per_unit: number }[]>();
  for (const l of boq ?? []) {
    const arr = boqByModel.get(l.model_id) ?? [];
    arr.push({ raw_material_id: l.raw_material_id, quantity_per_unit: Number(l.quantity_per_unit ?? 0) });
    boqByModel.set(l.model_id, arr);
  }
  for (const row of (boqUsage ?? []) as unknown as { quantity: number; model_id: string }[]) {
    for (const l of boqByModel.get(row.model_id) ?? []) {
      consumption.set(
        l.raw_material_id,
        (consumption.get(l.raw_material_id) ?? 0) + l.quantity_per_unit * Number(row.quantity ?? 0),
      );
    }
  }
  const purchasedQty = new Map<string, number>();
  const purchasedValue = new Map<string, number>();
  for (const row of (purchases ?? []) as unknown as {
    raw_material_id: string;
    quantity: number;
    unit_price: number;
  }[]) {
    purchasedQty.set(row.raw_material_id, (purchasedQty.get(row.raw_material_id) ?? 0) + Number(row.quantity ?? 0));
    purchasedValue.set(
      row.raw_material_id,
      (purchasedValue.get(row.raw_material_id) ?? 0) + Number(row.quantity ?? 0) * Number(row.unit_price ?? 0),
    );
  }

  const items = (materials ?? []).map((m) => {
    const used = consumption.get(m.id) ?? 0;
    const perDay = used / days;
    const stock = Number(m.on_hand ?? 0);
    const daysOfCover = perDay > 0 ? round(stock / perDay, 1) : null;
    const velocity: "fast" | "steady" | "slow" | "dormant" =
      perDay <= 0 ? "dormant" : daysOfCover != null && daysOfCover < 20 ? "fast" : daysOfCover != null && daysOfCover < 90 ? "steady" : "slow";
    return {
      material: m.name,
      code: m.code,
      unit: m.unit,
      currentStock: round(stock, 3),
      reorderLevel: round(Number(m.reorder_level ?? 0), 3),
      consumedInWindow: round(used, 3),
      purchasedInWindow: round(purchasedQty.get(m.id) ?? 0, 3),
      purchaseValueInWindow: round(purchasedValue.get(m.id) ?? 0),
      dailyConsumption: round(perDay, 4),
      daysOfCover,
      velocity,
      belowReorder: stock < Number(m.reorder_level ?? 0),
      stockOutRisk: daysOfCover != null && daysOfCover < 14,
      overstock: daysOfCover != null && daysOfCover > 180,
    };
  });

  return {
    windowDays: days,
    note: "Consumption is derived from BOQ requirements of sold models in the window.",
    totals: {
      materials: items.length,
      belowReorder: items.filter((i) => i.belowReorder).length,
      stockOutRisk: items.filter((i) => i.stockOutRisk).length,
      overstock: items.filter((i) => i.overstock).length,
      dormant: items.filter((i) => i.velocity === "dormant").length,
    },
    atRisk: items.filter((i) => i.stockOutRisk || i.belowReorder).slice(0, 25),
    slowMoving: items.filter((i) => i.velocity === "slow" || i.velocity === "dormant").slice(0, 25),
    fastMoving: items.filter((i) => i.velocity === "fast").slice(0, 25),
  };
}

/* ------------------------------------------------------------------ */
/* Production                                                          */
/* ------------------------------------------------------------------ */

export async function productionIntelligence(db: Db, days = 90) {
  const from = daysAgo(days);
  const [{ data: orders }, { data: movements }] = await Promise.all([
    db
      .from("production_orders")
      .select("id, production_number, status, created_at, started_at, qc_at, ready_at, dispatched_at, sales_order_id")
      .gte("created_at", `${from}T00:00:00Z`),
    db
      .from("stock_movements")
      .select("movement_type, quantity, amount, movement_date, stock_item_id")
      .gte("movement_date", from)
      .in("movement_type", ["production_in", "production_out", "adjustment"]),
  ]);

  const rows = orders ?? [];
  const byStatus = new Map<string, number>();
  for (const o of rows) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);

  const cycles = rows
    .filter((o) => o.started_at && o.ready_at)
    .map((o) => (new Date(o.ready_at!).getTime() - new Date(o.started_at!).getTime()) / 3_600_000);

  const consumedQty = sum(
    (movements ?? []).filter((m) => m.movement_type === "production_out").map((m) => Math.abs(Number(m.quantity ?? 0))),
  );
  const producedQty = sum(
    (movements ?? []).filter((m) => m.movement_type === "production_in").map((m) => Number(m.quantity ?? 0)),
  );
  const adjustments = (movements ?? []).filter((m) => m.movement_type === "adjustment");
  const scrapQty = sum(adjustments.filter((m) => Number(m.quantity) < 0).map((m) => Math.abs(Number(m.quantity))));

  // Expected consumption from the BOQ of models produced in the window.
  const { data: soldItems } = await db
    .from("sales_order_items")
    .select("quantity, model_id, sales_orders!inner(order_date)")
    .gte("sales_orders.order_date", from)
    .not("model_id", "is", null);
  const { data: boq } = await db.from("model_boq").select("model_id, quantity_per_unit");
  const boqPerModel = new Map<string, number>();
  for (const l of boq ?? []) boqPerModel.set(l.model_id, (boqPerModel.get(l.model_id) ?? 0) + Number(l.quantity_per_unit ?? 0));
  const expectedConsumption = sum(
    ((soldItems ?? []) as unknown as { quantity: number; model_id: string }[]).map(
      (i) => (boqPerModel.get(i.model_id) ?? 0) * Number(i.quantity ?? 0),
    ),
  );

  const variancePct = expectedConsumption ? round(((consumedQty - expectedConsumption) / expectedConsumption) * 100, 1) : null;

  return {
    windowDays: days,
    orders: rows.length,
    byStatus: Object.fromEntries(byStatus),
    averageCycleHours: cycles.length ? round(sum(cycles) / cycles.length, 1) : null,
    longestCycleHours: cycles.length ? round(Math.max(...cycles), 1) : null,
    materialMovement: {
      expectedConsumptionFromBoq: round(expectedConsumption, 3),
      actualConsumption: round(consumedQty, 3),
      variancePct,
      producedQuantity: round(producedQty, 3),
      scrapOrNegativeAdjustments: round(scrapQty, 3),
      wastagePct: consumedQty ? round((scrapQty / consumedQty) * 100, 2) : null,
    },
    note: "Actual consumption comes from stock movements; expected consumption is the BOQ requirement of models sold in the window. Nothing here changes production records or BOQs.",
  };
}

/* ------------------------------------------------------------------ */
/* Suppliers & purchasing                                              */
/* ------------------------------------------------------------------ */

export async function supplierPricing(db: Db, days = 365) {
  const from = daysAgo(days);
  const { data } = await db
    .from("purchase_bill_items")
    .select(
      "raw_material_id, quantity, unit_price, raw_materials(name, unit), purchase_bills!inner(bill_date, supplier_id, total_amount)",
    )
    .gte("purchase_bills.bill_date", from)
    .limit(5000);

  type Row = {
    raw_material_id: string;
    quantity: number;
    unit_price: number;
    raw_materials: { name: string; unit: string } | null;
    purchase_bills: { bill_date: string; supplier_id: string | null; total_amount: number } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const byMaterial = new Map<string, { name: string; unit: string; points: { date: string; rate: number; supplier: string | null }[] }>();
  const bySupplier = new Map<string, { spend: number; lines: number }>();

  for (const r of rows) {
    const date = r.purchase_bills?.bill_date;
    if (!date) continue;
    const entry = byMaterial.get(r.raw_material_id) ?? {
      name: r.raw_materials?.name ?? "Unknown material",
      unit: r.raw_materials?.unit ?? "",
      points: [],
    };
    entry.points.push({ date, rate: Number(r.unit_price ?? 0), supplier: r.purchase_bills?.supplier_id ?? null });
    byMaterial.set(r.raw_material_id, entry);

    const sid = r.purchase_bills?.supplier_id;
    if (sid) {
      const s = bySupplier.get(sid) ?? { spend: 0, lines: 0 };
      s.spend += Number(r.quantity ?? 0) * Number(r.unit_price ?? 0);
      s.lines += 1;
      bySupplier.set(sid, s);
    }
  }

  const names = await supplierNames(db, [...bySupplier.keys()]);
  const priceChanges = [...byMaterial.values()]
    .map((m) => {
      const points = m.points.sort((a, b) => a.date.localeCompare(b.date));
      if (points.length < 2) return null;
      const first = points[0]!;
      const last = points[points.length - 1]!;
      const rates = points.map((p) => p.rate);
      return {
        material: m.name,
        unit: m.unit,
        firstRate: round(first.rate),
        firstDate: first.date,
        latestRate: round(last.rate),
        latestDate: last.date,
        changePct: pct(last.rate, first.rate),
        minRate: round(Math.min(...rates)),
        maxRate: round(Math.max(...rates)),
        purchases: points.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));

  return {
    windowDays: days,
    increases: priceChanges.filter((p) => (p.changePct ?? 0) > 0).slice(0, 20),
    decreases: priceChanges.filter((p) => (p.changePct ?? 0) < 0).slice(-20).reverse(),
    topSuppliersBySpend: [...bySupplier.entries()]
      .map(([id, v]) => ({ supplier: names.get(id) ?? "Unknown", spend: round(v.spend), lines: v.lines }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 15),
  };
}

/* ------------------------------------------------------------------ */
/* Time series, anomalies, forecasts                                   */
/* ------------------------------------------------------------------ */

export async function monthlySeries(db: Db, months = 12) {
  const from = daysAgo(months * 31);
  const [{ data: invoices }, { data: bills }] = await Promise.all([
    db.from("invoices").select("invoice_date, subtotal, total_amount, tax_amount").gte("invoice_date", from).neq("status", "cancelled"),
    db.from("purchase_bills").select("bill_date, subtotal, total_amount").gte("bill_date", from),
  ]);

  const keys = new Set<string>();
  const rev = new Map<string, number>();
  const cost = new Map<string, number>();
  for (const i of invoices ?? []) {
    const k = monthKey(i.invoice_date);
    keys.add(k);
    rev.set(k, (rev.get(k) ?? 0) + Number(i.subtotal ?? 0));
  }
  for (const b of bills ?? []) {
    const k = monthKey(b.bill_date);
    keys.add(k);
    cost.set(k, (cost.get(k) ?? 0) + Number(b.subtotal ?? 0));
  }
  return [...keys]
    .sort()
    .map((month) => {
      const revenue = round(rev.get(month) ?? 0);
      const purchases = round(cost.get(month) ?? 0);
      return {
        month,
        revenue,
        purchaseCost: purchases,
        grossProfit: round(revenue - purchases),
        grossMarginPct: revenue ? round(((revenue - purchases) / revenue) * 100, 1) : null,
      };
    });
}

export async function forecasts(db: Db, monthsAhead = 3) {
  const series = await monthlySeries(db, 18);
  const usable = series.slice(0, -1); // exclude the partial current month
  const revenue = usable.map((s) => s.revenue);
  const profit = usable.map((s) => s.grossProfit);

  const inventory = await inventoryIntelligence(db, 90);
  const materialForecast = inventory.atRisk.slice(0, 10).map((m) => ({
    material: m.material,
    unit: m.unit,
    dailyConsumption: m.dailyConsumption,
    projectedConsumption30d: round(m.dailyConsumption * 30, 3),
    projectedConsumption90d: round(m.dailyConsumption * 90, 3),
    currentStock: m.currentStock,
    suggestedPurchaseFor90d: round(Math.max(0, m.dailyConsumption * 90 - m.currentStock), 3),
  }));

  const revFc = linearForecast(revenue, monthsAhead);
  const profitFc = linearForecast(profit, monthsAhead);

  return {
    basis: { monthsOfHistory: usable.length, method: "ordinary least squares trend on monthly totals" },
    sufficientData: usable.length >= 4,
    history: usable,
    revenueForecast: revFc.forecast,
    revenueTrendConfidence: revFc.r2,
    grossProfitForecast: profitFc.forecast,
    grossProfitTrendConfidence: profitFc.r2,
    materialRequirements: materialForecast,
    disclaimer: "Forecasts are statistical estimates from historical ERP data, not commitments.",
  };
}

export interface Anomaly {
  area: "sales" | "profitability" | "inventory" | "production" | "receivables" | "suppliers";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  metric?: Record<string, number | string | null>;
}

export async function detectAnomalies(db: Db): Promise<{ anomalies: Anomaly[]; evaluatedAt: string; dataSufficient: boolean }> {
  const out: Anomaly[] = [];
  const series = await monthlySeries(db, 13);
  const closed = series.slice(0, -1);
  const dataSufficient = closed.length >= 4;

  if (dataSufficient) {
    const rev = closed.map((s) => s.revenue);
    const revZ = zScore(rev);
    const last = closed[closed.length - 1]!;
    if (Math.abs(revZ.z) >= 2) {
      out.push({
        area: "sales",
        severity: Math.abs(revZ.z) >= 3 ? "high" : "medium",
        title: `${last.month} revenue is ${revZ.z > 0 ? "unusually high" : "unusually low"}`,
        detail: `Revenue of ${last.revenue} is ${Math.abs(revZ.z)} standard deviations from the ${closed.length - 1}-month mean of ${revZ.mean}.`,
        metric: { month: last.month, revenue: last.revenue, mean: revZ.mean, zScore: revZ.z },
      });
    }
    const margins = closed.map((s) => s.grossMarginPct ?? 0);
    const marginZ = zScore(margins);
    const lastMargin = margins[margins.length - 1]!;
    if (marginZ.z <= -1.5) {
      out.push({
        area: "profitability",
        severity: marginZ.z <= -2.5 ? "high" : "medium",
        title: `Gross margin dropped in ${last.month}`,
        detail: `Margin of ${lastMargin}% versus an average of ${marginZ.mean}% over prior months.`,
        metric: { month: last.month, marginPct: lastMargin, averagePct: marginZ.mean, zScore: marginZ.z },
      });
    }
  }

  const pricing = await supplierPricing(db, 365);
  for (const p of pricing.increases.slice(0, 5)) {
    if ((p.changePct ?? 0) >= 10) {
      out.push({
        area: "suppliers",
        severity: (p.changePct ?? 0) >= 25 ? "high" : "medium",
        title: `${p.material} purchase rate up ${p.changePct}%`,
        detail: `Rate moved from ${p.firstRate} (${p.firstDate}) to ${p.latestRate} (${p.latestDate}) across ${p.purchases} purchases.`,
        metric: { changePct: p.changePct, latestRate: p.latestRate, firstRate: p.firstRate },
      });
    }
  }

  const inv = await inventoryIntelligence(db, 90);
  for (const m of inv.atRisk.slice(0, 5)) {
    out.push({
      area: "inventory",
      severity: m.daysOfCover != null && m.daysOfCover < 7 ? "high" : "medium",
      title: `${m.material} is running low`,
      detail:
        m.daysOfCover != null
          ? `${m.currentStock} ${m.unit} left, about ${m.daysOfCover} days of cover at recent consumption.`
          : `${m.currentStock} ${m.unit} is below the reorder level of ${m.reorderLevel}.`,
      metric: { currentStock: m.currentStock, reorderLevel: m.reorderLevel, daysOfCover: m.daysOfCover },
    });
  }
  if (inv.totals.overstock > 0) {
    out.push({
      area: "inventory",
      severity: "low",
      title: `${inv.totals.overstock} materials look overstocked`,
      detail: "These materials hold more than 180 days of cover at current consumption.",
      metric: { count: inv.totals.overstock },
    });
  }

  const prod = await productionIntelligence(db, 90);
  const variance = prod.materialMovement.variancePct;
  if (variance != null && Math.abs(variance) >= 15) {
    out.push({
      area: "production",
      severity: Math.abs(variance) >= 30 ? "high" : "medium",
      title: `Material consumption is ${variance > 0 ? "above" : "below"} BOQ expectation by ${Math.abs(variance)}%`,
      detail: `Actual consumption ${prod.materialMovement.actualConsumption} against a BOQ expectation of ${prod.materialMovement.expectedConsumptionFromBoq}.`,
      metric: { variancePct: variance },
    });
  }
  if ((prod.materialMovement.wastagePct ?? 0) >= 5) {
    out.push({
      area: "production",
      severity: (prod.materialMovement.wastagePct ?? 0) >= 10 ? "high" : "medium",
      title: `Wastage at ${prod.materialMovement.wastagePct}% of consumption`,
      detail: "Negative stock adjustments are high relative to production consumption.",
      metric: { wastagePct: prod.materialMovement.wastagePct },
    });
  }

  const ar = await receivables(db);
  if (ar.ageing["90+"] > 0) {
    out.push({
      area: "receivables",
      severity: "high",
      title: `${ar.ageing["90+"]} outstanding for more than 90 days`,
      detail: `Total receivables ${ar.totalOutstanding}; the oldest bucket needs collection attention.`,
      metric: { over90: ar.ageing["90+"], total: ar.totalOutstanding },
    });
  }

  return { anomalies: out, evaluatedAt: new Date().toISOString(), dataSufficient };
}

/* ------------------------------------------------------------------ */
/* Snapshot used by the management brief                               */
/* ------------------------------------------------------------------ */

export async function businessSnapshot(db: Db) {
  const period = defaultPeriod(30);
  const [sales, profitability, inventory, production, ar, suppliers, anomalies, fc] = await Promise.all([
    salesSummary(db, period),
    productProfitability(db, period),
    inventoryIntelligence(db, 90),
    productionIntelligence(db, 90),
    receivables(db),
    supplierPricing(db, 365),
    detectAnomalies(db),
    forecasts(db, 3),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    sales,
    profitability: { ...profitability, products: profitability.products.slice(0, 10) },
    inventory: { totals: inventory.totals, atRisk: inventory.atRisk.slice(0, 8), slowMoving: inventory.slowMoving.slice(0, 8) },
    production,
    receivables: { asOf: ar.asOf, totalOutstanding: ar.totalOutstanding, ageing: ar.ageing, overdue: ar.overdue.slice(0, 8) },
    suppliers: { increases: suppliers.increases.slice(0, 8), topSuppliersBySpend: suppliers.topSuppliersBySpend.slice(0, 8) },
    anomalies: anomalies.anomalies,
    forecast: {
      sufficientData: fc.sufficientData,
      revenueForecast: fc.revenueForecast,
      revenueTrendConfidence: fc.revenueTrendConfidence,
      grossProfitForecast: fc.grossProfitForecast,
    },
  };
}
