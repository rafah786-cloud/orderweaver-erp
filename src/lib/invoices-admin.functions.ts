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


const InvoiceReceipt = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const recordInvoiceReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InvoiceReceipt.parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("record_invoice_receipt", {
      p_invoice: data.invoiceId,
      p_amount: data.amount,
      p_idempotency: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return { outstanding: Number(result ?? 0) };
  });

const ReverseInvoice = z.object({
  invoiceId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const reverseInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ReverseInvoice.parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("reverse_invoice", {
      p_invoice: data.invoiceId,
      p_idempotency: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    if (!result) throw new Error("Invoice reversal returned no voucher");
    return { reversalId: result as string };
  });
