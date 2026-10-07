import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Line = z.object({
  model_id: z.string().uuid(),
  product_name: z.string().trim().min(1).max(300),
  size: z.string().trim().max(100).nullable().optional(),
  quantity: z.number().finite().positive(),
  unit_price: z.number().finite().nonnegative(),
});

const CreateSalesOrder = z.object({
  party_id: z.string().uuid(),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expected_delivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  lines: z.array(Line).min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const createSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateSalesOrder.parse(d))
  .handler(async ({ data, context }) => {
    const idempotencyKey = data.idempotencyKey;
    const { data: result, error } = await context.supabase.rpc(
      "create_sales_order_atomic" as never,
      {
        p_party_id: data.party_id,
        p_order_date: data.order_date,
        p_expected_delivery: data.expected_delivery ?? null,
        p_notes: data.notes ?? null,
        p_idempotency_key: idempotencyKey,
        p_lines: data.lines,
      } as never,
    );
    if (error) throw new Error(error.message);
    const response: unknown = result;
    const parsed = z.object({ id: z.string().uuid(), order_number: z.string().min(1) })
      .safeParse(Array.isArray(response) ? response[0] : response);
    if (!parsed.success) throw new Error("Sales order creation returned no document");
    return { id: parsed.data.id, orderNumber: parsed.data.order_number };
  });
