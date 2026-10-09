import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;
export interface MattressSpecComponent {
  materialName: string;
  quantity: number;
  unit: string;
}
export interface MattressSpecCostResult {
  status: "calculated" | "insufficient-data";
  estimatedPrice: number | null;
  matchedMaterials: string[];
  missingMaterials: string[];
  costBasis: string[];
  note: string;
}
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Reverse mattress costing is deterministic and read-only. The model may
 * extract a structured specification, but never supplies prices. Every
 * material and rate is matched to active-company ERP data.
 */
export async function costMattressSpecification(
  db: Db,
  components: MattressSpecComponent[],
): Promise<MattressSpecCostResult> {
  const { data: companyId, error: companyError } = await db.rpc("current_company_id");
  if (companyError || !companyId) throw new Error("No active company selected.");
  if (!components.length || components.some((c) => !c.materialName.trim() || !Number.isFinite(c.quantity) || c.quantity <= 0 || !c.unit.trim())) {
    return { status: "insufficient-data", estimatedPrice: null, matchedMaterials: [], missingMaterials: components.map((c) => c.materialName), costBasis: [], note: "A material quantity and matching unit are required for every component." };
  }

  const [{ data: materials, error: materialError }, { data: stockItems, error: stockError }, { data: purchaseRows, error: purchaseError }] = await Promise.all([
    db.from("raw_materials").select("id, code, name, unit").eq("company_id", companyId).limit(5000),
    db.from("stock_items").select("mapped_raw_material_id, standard_price").not("mapped_raw_material_id", "is", null).eq("company_id", companyId).limit(5000),
    db.from("purchase_bill_items").select("raw_material_id, quantity, unit_price, purchase_bills!inner(bill_date)").eq("company_id", companyId).gte("purchase_bills.bill_date", new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)).limit(20000),
  ]);
  if (materialError) throw new Error(materialError.message);
  if (stockError) throw new Error(stockError.message);
  if (purchaseError) throw new Error(purchaseError.message);

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const materialRows = materials ?? [];
  const standard = new Map<string, number>();
  for (const row of stockItems ?? []) {
    const id = row.mapped_raw_material_id as string | null;
    const price = Number(row.standard_price);
    if (id && price > 0 && Number.isFinite(price) && !standard.has(id)) standard.set(id, price);
  }
  const qtys = new Map<string, number>(), values = new Map<string, number>();
  for (const row of purchaseRows ?? []) {
    const q = Number(row.quantity), p = Number(row.unit_price);
    if (!row.raw_material_id || q <= 0 || p <= 0 || !Number.isFinite(q * p)) continue;
    qtys.set(row.raw_material_id, (qtys.get(row.raw_material_id) ?? 0) + q);
    values.set(row.raw_material_id, (values.get(row.raw_material_id) ?? 0) + q * p);
  }
  const matched: string[] = [], missing: string[] = [], bases = new Set<string>();
  let materialTotal = 0;
  for (const component of components) {
    const needle = norm(component.materialName);
    const matches = materialRows.filter((m) => {
      const name = norm(m.name), code = norm(m.code ?? "");
      return name === needle || code === needle || (needle.length >= 4 && (name.includes(needle) || needle.includes(name)));
    });
    // Ambiguous matches are not silently resolved.
    const material = matches.length === 1 ? matches[0] : undefined;
    if (!material || norm(material.unit) !== norm(component.unit)) {
      missing.push(component.materialName + (matches.length > 1 ? " (ambiguous ERP match)" : matches.length === 1 ? ` (unit mismatch: ERP uses ${matches[0].unit})` : " (not found in ERP)"));
      continue;
    }
    const q = qtys.get(material.id) ?? 0;
    const purchaseRate = q > 0 ? (values.get(material.id) ?? 0) / q : 0;
    const rate = purchaseRate > 0 ? purchaseRate : standard.get(material.id);
    if (!rate || rate <= 0) {
      missing.push(material.name + " (no recorded purchase rate or standard price)");
      continue;
    }
    bases.add(purchaseRate > 0 ? "Recorded weighted purchase rates (last 365 days)" : "ERP standard stock prices");
    materialTotal += component.quantity * rate;
    matched.push(material.name);
  }
  if (missing.length) return {
    status: "insufficient-data", estimatedPrice: null, matchedMaterials: matched, missingMaterials: missing, costBasis: [...bases],
    note: "The specification could not be costed reliably because one or more materials, compatible units or ERP rates are missing or ambiguous. No substitute prices were invented.",
  };

  // Fixed policy: labour is 10% of material cost. The selling estimate applies
  // a 20% gross profit margin (profit is 20% of the final quoted amount).
  const withLabour = materialTotal * 1.10;
  const finalPrice = withLabour / 0.80;
  return {
    status: "calculated",
    estimatedPrice: round(finalPrice),
    matchedMaterials: matched,
    missingMaterials: [],
    costBasis: [...bases],
    note: "Estimated quote based on current ERP material pricing. Fixed labour and profit assumptions are applied internally; calculation details are intentionally not included in the customer-facing answer.",
  };
}
