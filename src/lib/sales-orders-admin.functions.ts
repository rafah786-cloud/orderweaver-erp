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
});

export const createSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateSalesOrder.parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "sales"]);
    if (!roles?.length) throw new Error("Insufficient permissions");

    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");

    const { data: party, error: partyError } = await context.supabase
      .from("parties").select("id").eq("id", data.party_id).eq("company_id", companyId).maybeSingle();
    if (partyError || !party) throw new Error("Party is outside the active company");

    const modelIds = [...new Set(data.lines.map((x) => x.model_id))];
    const { data: models, error: modelError } = await context.supabase
      .from("product_models").select("id, name, size").in("id", modelIds).eq("company_id", companyId);
    if (modelError) throw new Error(modelError.message);
    if ((models ?? []).length !== modelIds.length) throw new Error("One or more product models are invalid");

    const total = data.lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
    if (!(total > 0)) throw new Error("Order total must be greater than zero");

    const orderNumber = `SO-${Date.now().toString().slice(-8)}`;
    const { data: order, error: orderError } = await context.supabase
      .from("sales_orders")
      .insert({
        company_id: companyId,
        order_number: orderNumber,
        party_id: data.party_id,
        order_date: data.order_date,
        expected_delivery: data.expected_delivery ?? null,
        total_amount: total,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id, order_number")
      .single();
    if (orderError || !order) throw new Error(orderError?.message ?? "Failed to create sales order");

    const { error: lineError } = await context.supabase.from("sales_order_items").insert(
      data.lines.map((line) => ({
        sales_order_id: order.id,
        model_id: line.model_id,
        product_name: line.product_name,
        size: line.size ?? null,
        quantity: line.quantity,
        unit_price: line.unit_price,
        amount: Math.round(line.quantity * line.unit_price * 100) / 100,
      })),
    );
    if (lineError) throw new Error(lineError.message);

    return { id: order.id as string, orderNumber: order.order_number as string };
  });
