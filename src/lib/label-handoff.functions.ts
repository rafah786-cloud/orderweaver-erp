import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ sales_order_id: z.string().uuid() });

type SavedLine = {
  id: string; model_id: string | null; product_name: string; size: string | null;
  quantity: number | string; unit_price: number | string;
};

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

    const lines = rawLines as SavedLine[];
    const modelIds = Array.from(new Set(lines.map((line) => line.model_id).filter(Boolean))) as string[];
    const { data: models, error: modelError } = await db.from("product_models")
      .select("id,code,label_product_kind")
      .in("id", modelIds).eq("company_id", companyId);
    if (modelError) throw new Error("Product label classifications could not be read.");

    const byModel = new Map<string, { code: string | null; kind: string }>(
      (models ?? []).map((model: any) => [model.id, { code: model.code ?? null, kind: model.label_product_kind ?? "unclassified" }]),
    );
    const mattressLines = lines.filter((line) => line.model_id && byModel.get(line.model_id)?.kind === "mattress");
    const excludedLines = lines.length - mattressLines.length;
    if (!mattressLines.length) {
      throw new Error("No mattress lines are classified for labels. Set the relevant models to Mattress in BOQ → Models & Recipes first.");
    }

    const labelCount = mattressLines.reduce((sum, line) => sum + Number(line.quantity), 0);
    if (mattressLines.some((line) => !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) {
      throw new Error("A mattress line has a fractional or invalid quantity. Correct the saved Sales Order before printing one label per mattress.");
    }
    if (!Number.isSafeInteger(labelCount) || labelCount > 1000) {
      throw new Error("This order would create more than 1,000 labels. Split the run into smaller orders.");
    }

    const records: Record<string, string>[] = [];
    for (const line of mattressLines) {
      const qty = Number(line.quantity);
      const model = byModel.get(line.model_id!)!;
      const sku = (model.code || line.model_id!.replace(/-/g, "").slice(0, 12)).slice(0, 40);
      for (let unit = 1; unit <= qty; unit += 1) {
        const serial = "ZIZZ-" + order.order_number.replace(/[^A-Za-z0-9]/g, "") +
          "-" + line.id.replace(/-/g, "").slice(0, 12).toUpperCase() +
          "-" + String(unit).padStart(3, "0");
        records.push({
          ProductName: line.product_name, Barcode: serial, SKU: sku,
          Price: Number(line.unit_price).toFixed(2), MRP: "", Batch: order.order_number,
          Serial: serial, ManufacturingDate: "", ExpiryDate: "", Size: line.size ?? "",
          OrderNumber: order.order_number, OrderDate: order.order_date ?? "",
          UnitNumber: String(unit), Quantity: "1",
        });
      }
    }

    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    const { error: insertError } = await admin.from("label_handoff_jobs").insert({
      company_id: companyId, sales_order_id: order.id, token_hash: tokenHash,
      payload: {
        orderNumber: order.order_number,
        columns: ["ProductName", "Barcode", "SKU", "Price", "MRP", "Batch", "Serial", "ManufacturingDate", "ExpiryDate", "Size", "OrderNumber", "OrderDate", "UnitNumber", "Quantity"],
        rows: records, labelCount, excludedLines,
      },
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      created_by: context.userId,
    });
    if (insertError) throw new Error("The temporary label handoff could not be created. The Sales Order is still saved.");

    return {
      url: "https://printer-pixie-suite.lovable.app/data?handoff=" + token,
      order_number: order.order_number as string,
      label_count: labelCount,
      excluded_lines: excludedLines,
    };
  });
