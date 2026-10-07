import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Line=z.object({raw_material_id:z.string().uuid(),quantity:z.number().finite().positive(),unit_price:z.number().finite().nonnegative()});
const S=z.object({bill_number:z.string().trim().min(1).max(100),supplier_id:z.string().uuid().nullable().optional(),bill_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),notes:z.string().trim().max(5000).nullable().optional(),cgst_amount:z.number().finite().nonnegative(),sgst_amount:z.number().finite().nonnegative(),igst_amount:z.number().finite().nonnegative(),lines:z.array(Line).min(1).max(200)});
export const createPurchaseBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => S.parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "create_purchase_bill_atomic" as never,
      {
        p_bill_number: data.bill_number,
        p_supplier_id: data.supplier_id ?? null,
        p_bill_date: data.bill_date,
        p_notes: data.notes ?? null,
        p_cgst: data.cgst_amount,
        p_sgst: data.sgst_amount,
        p_igst: data.igst_amount,
        p_lines: data.lines,
      } as never,
    );
    if (error) throw new Error(error.message);
    if (!result) throw new Error("Purchase bill creation returned no document");
    return { id: result as string };
  });


export const receivePurchaseBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "receive_purchase_bill" as never,
      { p_bill: data.id } as never,
    );
    if (error) throw new Error(error.message);
    if (!result) throw new Error("Purchase receipt returned no bill");
    return { ok: true, id: result as string };
  });
