import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { prepareInvoiceVoucher } from "@/lib/accounting-foundation";

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
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "sales"]);
    if (!roles?.length) throw new Error("Insufficient permissions");

    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");

    const { data: company, error: companyLoadError } = await context.supabase
      .from("companies").select("id, code, gstin").eq("id", companyId).single();
    if (companyLoadError || !company) throw new Error("Active company not found");
    if (company.code.endsWith("_MGMT")) throw new Error("Invoices cannot be created in management books");

    const { data: party, error: partyError } = await context.supabase
      .from("parties").select("id, credit_limit").eq("id", data.party_id).eq("company_id", companyId).maybeSingle();
    if (partyError || !party) throw new Error("Party is outside the active company");

    const subtotal = data.lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
    const tax = data.lines.reduce((sum, line) => sum + (line.quantity * line.unit_price * line.tax_rate) / 100, 0);
    if (!(subtotal + tax > 0)) throw new Error("Invoice total must be greater than zero");
    if (tax > 0 && !data.supply) throw new Error("Select intra-state or inter-state tax treatment");
    const cgst = data.supply === "intra" ? tax / 2 : 0;
    const sgst = data.supply === "intra" ? tax - cgst : 0;
    const igst = data.supply === "inter" ? tax : 0;
    const total = subtotal + tax;

    const { data: outstanding, error: outstandingError } = await context.supabase
      .from("party_outstanding")
      .select("outstanding, oldest_unpaid_date")
      .eq("party_id", data.party_id).maybeSingle();
    if (outstandingError) throw new Error(outstandingError.message);
    const currentOutstanding = Number(outstanding?.outstanding ?? 0);
    const creditLimit = Number(party.credit_limit ?? 150000);
    if (currentOutstanding + total >= creditLimit)
      throw new Error(`Credit limit exceeded: projected outstanding ${(currentOutstanding + total).toFixed(2)} >= limit ${creditLimit.toFixed(2)}`);

    const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
    const { data: inv, error: invError } = await context.supabase
      .from("invoices")
      .insert({
        company_id: companyId, invoice_number: invoiceNumber, party_id: data.party_id,
        invoice_date: data.invoice_date, due_date: data.due_date ?? null,
        subtotal, tax_amount: tax, cgst_amount: data.supply ? cgst : null,
        sgst_amount: data.supply ? sgst : null, igst_amount: data.supply ? igst : null,
        total_amount: total, notes: data.notes ?? null, created_by: context.userId,
      })
      .select("id").single();
    if (invError || !inv) throw new Error(invError?.message ?? "Failed to create invoice");

    const { error: itemError } = await context.supabase.from("invoice_items").insert(
      data.lines.map((line) => ({
        invoice_id: inv.id, description: line.description, quantity: line.quantity,
        unit_price: line.unit_price, amount: Math.round(line.quantity * line.unit_price * 100) / 100,
        hsn_code: line.hsn_code ?? null, tax_rate: line.tax_rate,
      })),
    );
    if (itemError) {
      await context.supabase.from("invoices").delete().eq("id", inv.id);
      throw new Error(itemError.message);
    }

    const { data: partyLedger } = await context.supabase.from("ledger_accounts")
      .select("id").eq("mapped_party_id", data.party_id).eq("company_id", companyId).maybeSingle();
    const { data: salesLedger } = await context.supabase.from("ledger_accounts")
      .select("id").eq("name", "Sales").eq("is_active", true).eq("company_id", companyId).maybeSingle();
    const { data: taxLedgers } = await context.supabase.from("ledger_accounts")
      .select("id, name").in("name", ["Output CGST", "Output SGST", "Output IGST"])
      .eq("is_active", true).eq("company_id", companyId);
    const taxLedgerByName = new Map((taxLedgers ?? []).map((x) => [x.name, x.id]));
    const taxComponents = data.supply === "intra"
      ? [
          ...(cgst ? [{ ledgerAccountId: taxLedgerByName.get("Output CGST") ?? "", amount: cgst }] : []),
          ...(sgst ? [{ ledgerAccountId: taxLedgerByName.get("Output SGST") ?? "", amount: sgst }] : []),
        ]
      : data.supply === "inter" && igst
        ? [{ ledgerAccountId: taxLedgerByName.get("Output IGST") ?? "", amount: igst }]
        : undefined;

    if (!partyLedger?.id || !salesLedger?.id) {
      await context.supabase.from("invoices").delete().eq("id", inv.id);
      throw new Error("Required party or Sales ledger is not configured");
    }
    if (tax > 0 && taxComponents?.some((x) => !x.ledgerAccountId)) {
      await context.supabase.from("invoices").delete().eq("id", inv.id);
      throw new Error("Required output tax ledgers are not configured");
    }

    const prepared = prepareInvoiceVoucher({
      invoiceId: inv.id, invoiceNumber, invoiceDate: data.invoice_date,
      partyLedgerId: partyLedger.id, salesLedgerId: salesLedger.id,
      subtotal, taxAmount: tax, taxComponents,
    });
    if (!prepared.ok) {
      await context.supabase.from("invoices").delete().eq("id", inv.id);
      throw new Error(prepared.reason);
    }

    const { error: postError } = await context.supabase.rpc("create_gl_voucher" as never, {
      _type: prepared.call.type, _date: prepared.call.date, _entries: prepared.call.entries,
      _narration: prepared.call.narration, _reference: prepared.call.reference,
      _idempotency_key: prepared.call.idempotencyKey,
    } as never);
    if (postError) {
      await context.supabase.from("invoices").delete().eq("id", inv.id);
      throw new Error(postError.message);
    }

    return { id: inv.id as string, invoiceNumber, posted: true };
  });
