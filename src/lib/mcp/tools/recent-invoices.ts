import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "recent_invoices",
  title: "Recent invoices",
  description: "List up to 20 recent invoices for approved ERP staff with sales or accounting access.",
  inputSchema: { limit: z.number().int().min(1).max(20).default(10).describe("Maximum invoices to return, from 1 to 20.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Sign in to view invoices");
    const db = supabaseForUser(ctx);
    const [profile, roles] = await Promise.all([
      db.from("profiles").select("status").eq("id", ctx.getUserId()).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", ctx.getUserId()).in("role", ["admin", "accountant", "sales"]),
    ]);
    if (profile.error || roles.error) throw new ToolError("Could not verify ERP access");
    if (profile.data?.status !== "approved" || !roles.data?.length) throw new ToolError("Sales or accounting access is required");
    const { data, error } = await db.from("invoices")
      .select("id, invoice_number, invoice_date, total_amount, paid_amount, status")
      .order("invoice_date", { ascending: false }).limit(limit);
    if (error) throw new ToolError("Could not read invoices");
    const invoices = (data ?? []).map(({ id, invoice_number, invoice_date, total_amount, paid_amount, status }) =>
      ({ id, invoice_number, invoice_date, total_amount, paid_amount, status }));
    return { content: [{ type: "text", text: JSON.stringify(invoices) }], structuredContent: { invoices } };
  },
});