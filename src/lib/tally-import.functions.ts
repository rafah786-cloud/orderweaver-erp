import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const partySchema = z.object({
  name: z.string().min(1).max(255),
  gstin: z.string().max(20).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(255).nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  state_code: z.string().max(20).nullable().optional(),
  pin_code: z.string().max(20).nullable().optional(),
  opening_balance: z.number(),
});

const stockSchema = z.object({
  name: z.string().min(1).max(255),
  unit: z.string().max(40),
  opening_qty: z.number(),
  opening_rate: z.number(),
  group: z.string().max(255),
});

const inputSchema = z.object({
  customers: z.array(partySchema).max(20000),
  vendors: z.array(partySchema).max(20000),
  rawMaterials: z.array(stockSchema).max(20000),
  finishedGoods: z.array(stockSchema).max(20000),
});

export type TallyImportResult = {
  customers: { inserted: number; updated: number };
  vendors: { inserted: number; updated: number };
  rawMaterials: { inserted: number; updated: number };
  finishedGoods: { inserted: number; updated: number };
  errors: string[];
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export const importTallyMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const result: TallyImportResult = {
      customers: { inserted: 0, updated: 0 },
      vendors: { inserted: 0, updated: 0 },
      rawMaterials: { inserted: 0, updated: 0 },
      finishedGoods: { inserted: 0, updated: 0 },
      errors: [],
    };

    /* ---------------- parties (customers) ---------------- */
    {
      const { data: existing, error } = await supabase.from("parties").select("id, name, gstin");
      if (error) throw new Error(`Read parties failed: ${error.message}`);
      const byName = new Map<string, string>();
      const byGstin = new Map<string, string>();
      (existing ?? []).forEach((p) => {
        byName.set(norm(p.name), p.id);
        if (p.gstin) byGstin.set(norm(p.gstin), p.id);
      });

      for (const c of data.customers) {
        const existingId = (c.gstin && byGstin.get(norm(c.gstin))) || byName.get(norm(c.name));
        const row = {
          name: c.name,
          gstin: c.gstin ?? null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          address: c.address ?? null,
          state_code: c.state_code ?? null,
          pin_code: c.pin_code ?? null,
          notes: c.opening_balance ? `Tally opening balance: ${c.opening_balance.toFixed(2)}` : null,
        };
        if (existingId) {
          const { error: uErr } = await supabase.from("parties").update(row).eq("id", existingId);
          if (uErr) result.errors.push(`Customer ${c.name}: ${uErr.message}`);
          else result.customers.updated++;
        } else {
          const { error: iErr } = await supabase.from("parties").insert(row);
          if (iErr) result.errors.push(`Customer ${c.name}: ${iErr.message}`);
          else result.customers.inserted++;
        }
      }
    }

    /* ---------------- suppliers (vendors) ---------------- */
    {
      const { data: existing, error } = await supabase.from("suppliers").select("id, name, gstin");
      if (error) throw new Error(`Read suppliers failed: ${error.message}`);
      const byName = new Map<string, string>();
      const byGstin = new Map<string, string>();
      (existing ?? []).forEach((s) => {
        byName.set(norm(s.name), s.id);
        if (s.gstin) byGstin.set(norm(s.gstin), s.id);
      });

      for (const v of data.vendors) {
        const existingId = (v.gstin && byGstin.get(norm(v.gstin))) || byName.get(norm(v.name));
        const row = {
          name: v.name,
          gstin: v.gstin ?? null,
          phone: v.phone ?? null,
          email: v.email ?? null,
          address: v.address ?? null,
          notes: v.opening_balance ? `Tally opening balance: ${v.opening_balance.toFixed(2)}` : null,
        };
        if (existingId) {
          const { error: uErr } = await supabase.from("suppliers").update(row).eq("id", existingId);
          if (uErr) result.errors.push(`Vendor ${v.name}: ${uErr.message}`);
          else result.vendors.updated++;
        } else {
          const { error: iErr } = await supabase.from("suppliers").insert(row);
          if (iErr) result.errors.push(`Vendor ${v.name}: ${iErr.message}`);
          else result.vendors.inserted++;
        }
      }
    }

    /* ---------------- raw_materials ---------------- */
    {
      const { data: existing, error } = await supabase.from("raw_materials").select("id, name");
      if (error) throw new Error(`Read raw_materials failed: ${error.message}`);
      const byName = new Map<string, string>();
      (existing ?? []).forEach((r) => byName.set(norm(r.name), r.id));

      for (const m of data.rawMaterials) {
        const existingId = byName.get(norm(m.name));
        const row = {
          name: m.name,
          unit: m.unit || "pcs",
          current_stock: m.opening_qty,
          notes: m.group ? `Tally group: ${m.group}` : null,
        };
        if (existingId) {
          const { error: uErr } = await supabase.from("raw_materials").update(row).eq("id", existingId);
          if (uErr) result.errors.push(`Raw material ${m.name}: ${uErr.message}`);
          else result.rawMaterials.updated++;
        } else {
          const { error: iErr } = await supabase.from("raw_materials").insert(row);
          if (iErr) result.errors.push(`Raw material ${m.name}: ${iErr.message}`);
          else result.rawMaterials.inserted++;
        }
      }
    }

    /* ---------------- product_models (finished goods) ---------------- */
    {
      const { data: existing, error } = await supabase.from("product_models").select("id, name");
      if (error) throw new Error(`Read product_models failed: ${error.message}`);
      const byName = new Map<string, string>();
      (existing ?? []).forEach((p) => byName.set(norm(p.name), p.id));

      for (const f of data.finishedGoods) {
        const existingId = byName.get(norm(f.name));
        const row = {
          name: f.name,
          default_price: f.opening_rate,
          notes: f.group ? `Tally group: ${f.group}` : null,
        };
        if (existingId) {
          const { error: uErr } = await supabase.from("product_models").update(row).eq("id", existingId);
          if (uErr) result.errors.push(`Finished good ${f.name}: ${uErr.message}`);
          else result.finishedGoods.updated++;
        } else {
          const { error: iErr } = await supabase.from("product_models").insert(row);
          if (iErr) result.errors.push(`Finished good ${f.name}: ${iErr.message}`);
          else result.finishedGoods.inserted++;
        }
      }
    }

    return result;
  });
