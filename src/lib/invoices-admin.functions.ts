import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Line = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().finite().positive(),
  unit_price: z.number().finite().nonnegative(),
  hsn_code: z.string().trim().max(50).nullable().optional(),
  tax_rate: z.number().finite().min(0).max(100),
});

const CreateInvoice = z.object({
  party_id: z.string().uuid(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  supply: z.enum(["intra", "inter"]).nullable().optional(),
  lines: z.array(Line).min(1).max(200),
});

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateInvoice.parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("create_invoice_atomic" as never, {
      p_party_id: data.party_id,
      p_invoice_date: data.invoice_date,
      p_due_date: data.due_date ?? null,
      p_notes: data.notes ?? null,
      p_supply: data.supply ?? null,
      p_lines: data.lines,
    } as never);

    if (error) throw new Error(error.message);

    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.id || !row?.invoice_number) {
      throw new Error("Invoice creation returned no document");
    }

    return {
      id: row.id as string,
      invoiceNumber: row.invoice_number as string,
      posted: true,
    };
  });
