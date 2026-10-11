import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RequestInput = z.object({
  party_id: z.string().uuid(),
  requested_delivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  idempotency_key: z.string().min(8).max(128),
  lines: z.array(z.object({
    model_id: z.string().uuid(),
    quantity: z.number().finite().positive().max(100000),
  })).min(1).max(200),
});

const ConvertInput = z.object({
  request_id: z.string().uuid(),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expected_delivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  idempotency_key: z.string().min(8).max(128),
  prices: z.array(z.object({
    request_line_id: z.string().uuid(),
    unit_price: z.number().finite().nonnegative().max(100000000),
  })).min(1).max(200),
});

async function requireRole(db: any, userId: string, roles: string[]) {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId).in("role", roles);
  if (error || !data?.some((row: { role: string }) => roles.includes(row.role))) {
    throw new Error("You do not have permission to perform this order-request action.");
  }
}

export const createSalesOrderRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RequestInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, ["admin", "sales"]);
    const db: any = context.supabase;
    const { data: result, error } = await db.rpc("create_sales_order_request_atomic", {
      p_party_id: data.party_id,
      p_requested_delivery: data.requested_delivery ?? null,
      p_notes: data.notes ?? null,
      p_idempotency_key: data.idempotency_key,
      p_lines: data.lines,
    });
    if (error) throw new Error("The request could not be saved. Refresh the page and try again.");
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.id || !row?.request_number) throw new Error("The ERP did not confirm the saved request.");
    return { id: row.id as string, request_number: row.request_number as string };
  });

export const convertSalesOrderRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ConvertInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, ["admin", "accountant"]);
    const db: any = context.supabase;
    const { data: result, error } = await db.rpc("convert_sales_order_request_atomic", {
      p_request_id: data.request_id,
      p_order_date: data.order_date,
      p_expected_delivery: data.expected_delivery ?? null,
      p_notes: data.notes ?? null,
      p_idempotency_key: data.idempotency_key,
      p_prices: data.prices,
    });
    if (error) throw new Error("The Sales Order was not confirmed. Check the request and prices, then retry.");
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.id || !row?.order_number) throw new Error("The ERP did not confirm the Sales Order.");
    return { id: row.id as string, order_number: row.order_number as string };
  });
