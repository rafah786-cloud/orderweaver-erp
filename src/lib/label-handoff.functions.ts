import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildSalesOrderLabelBatch, type SavedSalesOrderLine } from "@/lib/build-sales-order-label-batch";

const Input = z.object({ sales_order_id: z.string().uuid() });

export const createLabelHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const roles = ["admin", "sales", "accountant"];
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).in("role", roles as any);
    if (roleError || !roleRows?.some((row) => roles.includes(row.role))) {
      throw new Error("You do not have permission to prepare labels for this Sales Order.");
    }

    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("Select an active company before preparing labels.");

    const db: any = context.supabase;
    const { data: order, error: orderError } = await db.from("sales_orders")
      .select("id,order_number,order_date,company_id")
      .eq("id", data.sales_order_id).eq("company_id", companyId).maybeSingle();
    if (orderError || !order) throw new Error("The Sales Order is not available in the active company.");

    const { data: rawLines, error: lineError } = await db.from("sales_order_items")
      .select("id,model_id,product_name,size,quantity,unit_price")
      .eq("sales_order_id", order.id).eq("company_id", companyId).order("id");
    if (lineError || !rawLines?.length) throw new Error("Saved Sales Order lines could not be read.");

    const lines = rawLines as SavedSalesOrderLine[];
    const modelIds = Array.from(new Set(lines.map((line) => line.model_id).filter(Boolean))) as string[];
    const { data: models, error: modelError } = await db.from("product_models")
      .select("id,code,label_product_kind,extra_specs,thickness,cover_fabric,foam_density")
      .in("id", modelIds).eq("company_id", companyId);
    if (modelError) throw new Error("Product label classifications could not be read.");

    const batch = buildSalesOrderLabelBatch(
      { order_number: order.order_number, order_date: order.order_date ?? null },
      lines,
      (models ?? []).map((model: any) => ({
        id: model.id,
        code: model.code ?? null,
        label_product_kind: model.label_product_kind ?? "unclassified",
        extra_specs: model.extra_specs ?? {},
        thickness: model.thickness ?? null,
        cover_fabric: model.cover_fabric ?? null,
        foam_density: model.foam_density ?? null,
      })),
    );
    const { records, labelCount, excludedLines } = batch;

    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    const { data: existing, error: existingError } = await admin.from("label_handoff_jobs")
      .select("id,expires_at,consumed_at,token_hash")
      .eq("company_id", companyId)
      .eq("sales_order_id", order.id)
      .maybeSingle();
    if (existingError) throw new Error("Could not check the order's existing label handoff.");

    const handoffPayload = {
      orderNumber: order.order_number,
      columns: ["ProductName", "Model", "ModelSub", "Type", "Size", "SizeIn", "SizeCm", "Brand", "Barcode", "SKU", "Price", "MRP", "Batch", "Serial", "ManufacturingDate", "MfgDate", "ExpiryDate", "OrderNumber", "OrderDate", "UnitNumber", "Quantity"],
      rows: records, labelCount, excludedLines,
    };

    if (existing?.consumed_at) {
      throw new Error("This Sales Order's initial label batch was already opened in Smart Label Creator. To avoid duplicate labels, use the existing dataset and deliberately reprint there instead of creating a second batch.");
    }
    if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
      throw new Error("A label handoff for this order is already active. No duplicate batch was created. Open the existing Smart Label Creator tab, or wait for its 10-minute token to expire if it was never opened.");
    }

    if (existing) {
      // An expired, never-consumed handoff can safely be refreshed in place.
      // Its previous token immediately becomes invalid; the unique per-order row remains.
      const { data: updated, error: updateError } = await admin.from("label_handoff_jobs")
        .update({ token_hash: tokenHash, payload: handoffPayload, expires_at: expiresAt, created_by: context.userId })
        .eq("id", existing.id)
        .eq("company_id", companyId)
        .eq("token_hash", existing.token_hash)
        .is("consumed_at", null)
        .select("id")
        .maybeSingle();
      if (updateError || !updated) {
        throw new Error("The expired label handoff could not be refreshed safely. The Sales Order remains saved.");
      }
    } else {
      const { error: insertError } = await admin.from("label_handoff_jobs").insert({
        company_id: companyId, sales_order_id: order.id, token_hash: tokenHash,
        payload: handoffPayload, expires_at: expiresAt, created_by: context.userId,
      });
      if (insertError) throw new Error("The temporary label handoff could not be created. The Sales Order is still saved.");
    }

    return {
      url: "https://printer-pixie-suite.lovable.app/data#handoff=" + token,
      order_number: order.order_number as string,
      label_count: labelCount,
      excluded_lines: excludedLines,
    };
  });
