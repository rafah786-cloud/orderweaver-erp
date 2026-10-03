import { z } from "zod";
import type { Db } from "./erp-data.server";

/**
 * Controlled query layer for natural-language ERP search.
 *
 * The model NEVER writes SQL. It emits a small JSON query spec which is
 * validated against this whitelist of entities, columns, operators and limits
 * and then executed through the Supabase query builder using the caller's
 * RLS-scoped client. Anything outside the whitelist is rejected.
 */

interface EntityDef {
  table: string;
  label: string;
  select: string;
  /** Columns the model may filter or sort on. */
  columns: Record<string, "text" | "number" | "date" | "boolean" | "uuid">;
  defaultOrder: { column: string; ascending: boolean };
  description: string;
}

export const ENTITIES: Record<string, EntityDef> = {
  invoices: {
    table: "invoices",
    label: "Sales invoices",
    select:
      "id, invoice_number, invoice_date, due_date, subtotal, tax_amount, total_amount, paid_amount, status, parties(name, phone)",
    columns: {
      invoice_number: "text",
      invoice_date: "date",
      due_date: "date",
      subtotal: "number",
      tax_amount: "number",
      total_amount: "number",
      paid_amount: "number",
      status: "text",
      party_id: "uuid",
    },
    defaultOrder: { column: "invoice_date", ascending: false },
    description: "Customer invoices with amounts, due dates and payment status (draft/unpaid/partial/paid/cancelled).",
  },
  sales_orders: {
    table: "sales_orders",
    label: "Sales orders",
    select: "id, order_number, order_date, expected_delivery, total_amount, notes, parties(name)",
    columns: {
      order_number: "text",
      order_date: "date",
      expected_delivery: "date",
      total_amount: "number",
      party_id: "uuid",
    },
    defaultOrder: { column: "order_date", ascending: false },
    description: "Customer sales orders.",
  },
  purchase_bills: {
    table: "purchase_bills",
    label: "Purchase bills",
    select:
      "id, bill_number, bill_date, subtotal, tax_amount, total_amount, vendor_ack_status, expected_dispatch_date, suppliers(name)",
    columns: {
      bill_number: "text",
      bill_date: "date",
      subtotal: "number",
      tax_amount: "number",
      total_amount: "number",
      supplier_id: "uuid",
      vendor_ack_status: "text",
    },
    defaultOrder: { column: "bill_date", ascending: false },
    description: "Supplier purchase bills / purchase orders.",
  },
  parties: {
    table: "parties",
    label: "Customers",
    select:
      "id, name, contact_person, phone, email, gstin, credit_limit, current_balance, state_code, customer_code, created_at",
    columns: {
      name: "text",
      phone: "text",
      gstin: "text",
      current_balance: "number",
      credit_limit: "number",
      state_code: "text",
      created_at: "date",
    },
    defaultOrder: { column: "name", ascending: true },
    description: "Customer master records with outstanding balances.",
  },
  suppliers: {
    table: "suppliers",
    label: "Suppliers",
    select: "id, name, contact_person, phone, email, gstin, current_balance, state_code, vendor_code, created_at",
    columns: {
      name: "text",
      phone: "text",
      gstin: "text",
      current_balance: "number",
      state_code: "text",
      created_at: "date",
    },
    defaultOrder: { column: "name", ascending: true },
    description: "Supplier / vendor master records.",
  },
  raw_materials: {
    table: "raw_materials",
    label: "Raw materials",
    select: "id, code, name, unit, reorder_level, updated_at",
    columns: {
      code: "text",
      name: "text",
      unit: "text",
            reorder_level: "number",
    },
    defaultOrder: { column: "name", ascending: true },
    description: "Raw material stock levels and reorder thresholds.",
  },
  stock_items: {
    table: "stock_items",
    label: "Stock items",
    select: "id, code, name, unit, hsn_code, gst_rate, reorder_level, min_stock, standard_cost, standard_price, is_active",
    columns: {
      code: "text",
      name: "text",
      hsn_code: "text",
      gst_rate: "number",
      standard_cost: "number",
      standard_price: "number",
      is_active: "boolean",
    },
    defaultOrder: { column: "name", ascending: true },
    description: "Inventory stock item master.",
  },
  product_models: {
    table: "product_models",
    label: "Product models",
    select: "id, code, name, size, thickness, cover_fabric, foam_density, warranty, default_price",
    columns: {
      code: "text",
      name: "text",
      size: "text",
      thickness: "text",
      default_price: "number",
    },
    defaultOrder: { column: "name", ascending: true },
    description: "Mattress product models with specifications and list prices.",
  },
  production_orders: {
    table: "production_orders",
    label: "Production orders",
    select:
      "id, production_number, status, created_at, started_at, qc_at, ready_at, dispatched_at, tracking_number, transporter_name",
    columns: {
      production_number: "text",
      status: "text",
      created_at: "date",
      ready_at: "date",
      dispatched_at: "date",
    },
    defaultOrder: { column: "created_at", ascending: false },
    description: "Production orders and their workflow status.",
  },
  stock_movements: {
    table: "stock_movements",
    label: "Stock movements",
    select: "id, movement_date, movement_type, quantity, rate, amount, narration, stock_items(name, unit)",
    columns: {
      movement_date: "date",
      movement_type: "text",
      quantity: "number",
      amount: "number",
      stock_item_id: "uuid",
    },
    defaultOrder: { column: "movement_date", ascending: false },
    description: "Inventory movements: purchase, sale, production in/out, transfers, adjustments.",
  },
};

const OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "ilike", "in", "is_null", "not_null"] as const;

export const querySpecSchema = z.object({
  entity: z.string(),
  filters: z
    .array(
      z.object({
        column: z.string(),
        op: z.enum(OPERATORS),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
      }),
    )
    .max(8)
    .default([]),
  orderBy: z.string().optional(),
  ascending: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  explanation: z.string().optional(),
});

export type QuerySpec = z.infer<typeof querySpecSchema>;

export function describeEntities(): string {
  return Object.entries(ENTITIES)
    .map(([key, e]) => `- ${key}: ${e.description} Filterable columns: ${Object.keys(e.columns).join(", ")}.`)
    .join("\n");
}

export interface QueryResult {
  entity: string;
  label: string;
  spec: QuerySpec;
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export async function runControlledQuery(db: Db, rawSpec: unknown): Promise<QueryResult> {
  const spec = querySpecSchema.parse(rawSpec);
  const entity = ENTITIES[spec.entity];
  if (!entity) {
    throw new Error(`Unsupported search target "${spec.entity}". Available: ${Object.keys(ENTITIES).join(", ")}.`);
  }

  const limit = spec.limit ?? 50;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db.from(entity.table as never).select(entity.select);

  for (const f of spec.filters) {
    const kind = entity.columns[f.column];
    if (!kind) throw new Error(`Column "${f.column}" cannot be filtered on ${spec.entity}.`);
    switch (f.op) {
      case "is_null":
        query = query.is(f.column, null);
        break;
      case "not_null":
        query = query.not(f.column, "is", null);
        break;
      case "in": {
        const list = Array.isArray(f.value) ? f.value : [f.value];
        query = query.in(f.column, list.filter((v) => v != null).slice(0, 50));
        break;
      }
      case "ilike":
        query = query.ilike(f.column, `%${String(f.value ?? "")}%`);
        break;
      default: {
        if (f.value == null) throw new Error(`Filter on "${f.column}" is missing a value.`);
        const value = kind === "number" ? Number(f.value) : f.value;
        query = query[f.op](f.column, value);
      }
    }
  }

  const orderColumn = spec.orderBy && entity.columns[spec.orderBy] ? spec.orderBy : entity.defaultOrder.column;
  const ascending = spec.ascending ?? entity.defaultOrder.ascending;
  query = query.order(orderColumn, { ascending, nullsFirst: false }).limit(limit + 1);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  const truncated = rows.length > limit;

  return {
    entity: spec.entity,
    label: entity.label,
    spec: { ...spec, limit, orderBy: orderColumn, ascending },
    rows: truncated ? rows.slice(0, limit) : rows,
    rowCount: truncated ? limit : rows.length,
    truncated,
  };
}
