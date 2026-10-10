import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type MattressRecommendationDb = SupabaseClient<Database>;

export interface MattressBudgetRecommendationInput {
  budget: number;
  limit?: number;
  stockOnly?: boolean;
  preferInStock?: boolean;
  preference?: "cheaper" | "premium" | "balanced";
}

export interface MattressRecommendationCandidate {
  modelId: string;
  code: string | null;
  name: string;
  size: string | null;
  thickness: string | null;
  foamDensity: string | null;
  coverFabric: string | null;
  defaultPrice: number;
  estimatedMaterialCost: number;
  materialCostComplete: boolean;
  stockReady: boolean;
  stockCoveragePct: number;
  score: number;
  costBasis: "weighted_purchase_rate_365d" | "standard_stock_price" | "incomplete";
  components: Array<{
    rawMaterialId: string;
    material: string;
    code: string | null;
    quantityPerUnit: number;
    unit: string;
    currentStock: number;
    unitCost: number | null;
    lineCost: number | null;
    available: boolean;
  }>;
  extraSpecs: Record<string, unknown>;
}

export interface MattressBudgetRecommendationResult {
  budget: number;
  requestedCount: number;
  candidates: MattressRecommendationCandidate[];
  totalDefensibleCandidates: number;
  dataSufficientForFive: boolean;
  limitations: string[];
  sourceWindowDays: number;
  note: string;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normaliseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Deterministic, read-only mattress recommendation engine.
 *
 * It only recommends existing product models with existing BOQs. It never
 * invents a material, quantity, cost or specification. Costs come from the
 * weighted purchase rate in the last 365 days, falling back only to an ERP
 * stock item's configured standard price. Candidates with an unresolved
 * component cost are not counted as defensible recommendations.
 */
export async function mattressBudgetRecommendations(
  db: MattressRecommendationDb,
  input: MattressBudgetRecommendationInput,
): Promise<MattressBudgetRecommendationResult> {
  const budget = Number(input.budget);
  const requestedCount = Math.max(5, Math.min(10, Number(input.limit ?? 5)));

  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error("A positive customer budget is required.");
  }

  const { data: companyId, error: companyError } = await db.rpc("current_company_id");
  if (companyError || !companyId) throw new Error("No active company selected.");

  const { data: models, error: modelError } = await db
    .from("product_models")
    .select("id, code, name, size, thickness, cover_fabric, foam_density, default_price, extra_specs")
    .eq("company_id", companyId)
    .gt("default_price", 0)
    .lte("default_price", budget)
    .order("default_price", { ascending: true })
    .limit(200);

  if (modelError) throw new Error(modelError.message);

  const modelRows = (models ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
    size: string | null;
    thickness: string | null;
    cover_fabric: string | null;
    foam_density: string | null;
    default_price: number;
    extra_specs: unknown;
  }>;

  if (!modelRows.length) {
    return {
      budget,
      requestedCount,
      candidates: [],
      totalDefensibleCandidates: 0,
      dataSufficientForFive: false,
      limitations: ["No existing product model with a configured selling price at or below the requested budget was found."],
      sourceWindowDays: 365,
      note: "Recommendations are limited to existing ERP product models and BOQs; no new specification was invented.",
    };
  }

  const modelIds = modelRows.map((m) => m.id);

  const [{ data: boqRows, error: boqError }, { data: materials, error: materialError }, { data: stockItems, error: stockError }, releasedBomResult] =
    await Promise.all([
      db
        .from("model_boq")
        .select("model_id, raw_material_id, quantity_per_unit")
        .eq("company_id", companyId)
        .in("model_id", modelIds),
      db
        .from("raw_materials")
        .select("id, code, name, unit, current_stock")
        .eq("company_id", companyId)
        .limit(5000),
      db
        .from("stock_items")
        .select("id, mapped_raw_material_id, standard_price")
        .not("mapped_raw_material_id", "is", null)
        .eq("company_id", companyId)
        .limit(5000),
      (db as any)
        .from("bom_revisions")
        .select("id, model_id, status, effective_from, effective_to, bom_revision_lines(raw_material_id, quantity_per_unit, scrap_pct)")
        .eq("company_id", companyId)
        .eq("status", "released")
        .in("model_id", modelIds)
        .limit(1000),
    ]);

  if (boqError) throw new Error(boqError.message);
  if (materialError) throw new Error(materialError.message);
  if (stockError) throw new Error(stockError.message);
  if (releasedBomResult.error) throw new Error(releasedBomResult.error.message);

  const bomByModel = new Map<string, Array<{ raw_material_id: string; quantity_per_unit: number }>>();
  for (const row of boqRows ?? []) {
    const quantity = numberOrNull(row.quantity_per_unit);
    if (quantity == null || quantity <= 0) continue;
    const list = bomByModel.get(row.model_id) ?? [];
    list.push({ raw_material_id: row.raw_material_id, quantity_per_unit: quantity });
    bomByModel.set(row.model_id, list);
  }

  // Prefer a currently effective released PLM BOM when the legacy model_boq
  // table has no BOM. Never let an expired or future revision win just because
  // the database returned it first.
  const today = new Date().toISOString().slice(0, 10);
  const revisionsByModel = new Map<string, any[]>();
  for (const revision of (releasedBomResult.data ?? []) as any[]) {
    if (bomByModel.has(revision.model_id)) continue;
    const effectiveFrom = typeof revision.effective_from === "string" ? revision.effective_from : null;
    const effectiveTo = typeof revision.effective_to === "string" ? revision.effective_to : null;
    if (effectiveFrom && effectiveFrom > today) continue;
    if (effectiveTo && effectiveTo < today) continue;
    const list = revisionsByModel.get(revision.model_id) ?? [];
    list.push(revision);
    revisionsByModel.set(revision.model_id, list);
  }

  for (const [modelId, revisions] of revisionsByModel) {
    revisions.sort((a, b) => {
      const aFrom = typeof a.effective_from === "string" ? a.effective_from : "";
      const bFrom = typeof b.effective_from === "string" ? b.effective_from : "";
      return bFrom.localeCompare(aFrom) || String(b.id ?? "").localeCompare(String(a.id ?? ""));
    });
    const revision = revisions[0];
    const lines = Array.isArray(revision?.bom_revision_lines) ? revision.bom_revision_lines : [];
    const valid = lines
      .map((line: any) => {
        const qty = numberOrNull(line.quantity_per_unit);
        const scrap = numberOrNull(line.scrap_pct) ?? 0;
        if (!line.raw_material_id || qty == null || qty <= 0) return null;
        return { raw_material_id: line.raw_material_id, quantity_per_unit: qty * (1 + Math.max(0, scrap) / 100) };
      })
      .filter(Boolean) as Array<{ raw_material_id: string; quantity_per_unit: number }>;
    if (valid.length) bomByModel.set(modelId, valid);
  }

  const materialById = new Map(
    (materials ?? []).map((m) => [
      m.id,
      {
        code: m.code as string | null,
        name: m.name as string,
        unit: m.unit as string,
        currentStock: numberOrNull(m.current_stock) ?? 0,
      },
    ]),
  );

  const standardPriceByMaterial = new Map<string, number>();
  for (const item of stockItems ?? []) {
    const materialId = item.mapped_raw_material_id as string | null;
    const price = numberOrNull(item.standard_price);
    if (!materialId || price == null || price <= 0 || standardPriceByMaterial.has(materialId)) continue;
    standardPriceByMaterial.set(materialId, price);
  }

  const { data: purchaseRows, error: purchaseError } = await db
    .from("purchase_bill_items")
    .select("raw_material_id, quantity, unit_price, purchase_bills!inner(bill_date)")
    .eq("company_id", companyId)
    .gte("purchase_bills.bill_date", new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10))
    .limit(20_000);

  if (purchaseError) throw new Error(purchaseError.message);

  const purchasedQty = new Map<string, number>();
  const purchasedValue = new Map<string, number>();
  for (const row of purchaseRows ?? []) {
    const qty = numberOrNull(row.quantity) ?? 0;
    const rate = numberOrNull(row.unit_price) ?? 0;
    if (qty <= 0 || rate <= 0) continue;
    purchasedQty.set(row.raw_material_id, (purchasedQty.get(row.raw_material_id) ?? 0) + qty);
    purchasedValue.set(
      row.raw_material_id,
      (purchasedValue.get(row.raw_material_id) ?? 0) + qty * rate,
    );
  }

  const weightedRate = new Map<string, number>();
  for (const [materialId, qty] of purchasedQty) {
    const value = purchasedValue.get(materialId) ?? 0;
    if (qty > 0 && value > 0) weightedRate.set(materialId, value / qty);
  }

  const candidates: MattressRecommendationCandidate[] = [];

  for (const model of modelRows) {
    const bom = bomByModel.get(model.id) ?? [];
    if (!bom.length) continue;

    let materialCost = 0;
    let complete = true;
    let stockReady = true;
    let minimumCoverage = 100;
    let hasPurchaseCost = false;
    let hasStandardCost = false;

    const components = bom.map((line) => {
      const material = materialById.get(line.raw_material_id);
      if (!material) {
        complete = false;
        stockReady = false;
        minimumCoverage = 0;
        return {
          rawMaterialId: line.raw_material_id,
          material: "Unknown ERP material",
          code: null,
          quantityPerUnit: line.quantity_per_unit,
          unit: "",
          currentStock: 0,
          unitCost: null,
          lineCost: null,
          available: false,
        };
      }

      const purchaseRate = weightedRate.get(line.raw_material_id);
      const standardRate = standardPriceByMaterial.get(line.raw_material_id);
      const unitCost = purchaseRate ?? standardRate ?? null;
      const lineCost = unitCost == null ? null : line.quantity_per_unit * unitCost;

      if (purchaseRate != null) hasPurchaseCost = true;
      else if (standardRate != null) hasStandardCost = true;
      else complete = false;

      const coverage = line.quantity_per_unit > 0
        ? Math.min(100, (material.currentStock / line.quantity_per_unit) * 100)
        : 100;
      minimumCoverage = Math.min(minimumCoverage, coverage);
      if (material.currentStock + 1e-9 < line.quantity_per_unit) stockReady = false;
      if (lineCost != null) materialCost += lineCost;

      return {
        rawMaterialId: line.raw_material_id,
        material: material.name,
        code: material.code,
        quantityPerUnit: line.quantity_per_unit,
        unit: material.unit,
        currentStock: material.currentStock,
        unitCost: money(unitCost ?? 0),
        lineCost: money(lineCost ?? 0),
        available: material.currentStock + 1e-9 >= line.quantity_per_unit,
      };
    });

    if (!complete) continue;
    if (input.stockOnly && !stockReady) continue;

    const costBasis: MattressRecommendationCandidate["costBasis"] =
      hasPurchaseCost ? "weighted_purchase_rate_365d" : hasStandardCost ? "standard_stock_price" : "incomplete";

    // Prefer closer-to-budget products, then complete stock readiness, then
    // lower material cost. This is deterministic and transparent.
    const budgetFit = budget > 0 ? model.default_price / budget : 0;
    const preference = input.preference ?? "balanced";
    const preferenceScore =
      preference === "cheaper"
        ? Math.max(0, 55 - budgetFit * 55)
        : preference === "premium"
          ? Math.min(55, budgetFit * 55)
          : Math.max(0, 40 - Math.abs(1 - budgetFit) * 40);
    const score =
      (input.preferInStock || input.stockOnly ? (stockReady ? 100 : 0) : stockReady ? 35 : 0) +
      preferenceScore +
      Math.max(0, 25 - Math.min(25, materialCost / Math.max(1, budget) * 25));

    candidates.push({
      modelId: model.id,
      code: model.code,
      name: model.name,
      size: model.size,
      thickness: model.thickness,
      foamDensity: model.foam_density,
      coverFabric: model.cover_fabric,
      defaultPrice: money(Number(model.default_price)),
      estimatedMaterialCost: money(materialCost),
      materialCostComplete: complete,
      stockReady,
      stockCoveragePct: money(minimumCoverage),
      score: money(score),
      costBasis,
      components,
      extraSpecs: normaliseObject(model.extra_specs),
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.defaultPrice - b.defaultPrice);

  const selected = candidates.slice(0, requestedCount);
  const limitations: string[] = [];
  if (selected.length < 5) {
    limitations.push(
      `Only ${selected.length} defensible existing ERP product models met the budget and data-quality rules; current ERP data does not support five recommendations, and the AI will not invent additional mattresses.`,
    );
  }
  if (selected.some((c) => c.costBasis === "standard_stock_price")) {
    limitations.push("Some material costs use the ERP stock item's configured standard price because no purchase rate was available in the last 365 days.");
  }
  if (selected.some((c) => !c.stockReady)) {
    limitations.push("Some recommendations are budget-fit but not fully buildable from current raw-material stock.");
  }

  return {
    budget,
    requestedCount,
    candidates: selected,
    totalDefensibleCandidates: candidates.length,
    dataSufficientForFive: candidates.length >= 5,
    limitations,
    sourceWindowDays: 365,
    note: "All recommendations are derived from existing ERP product models, BOQs, current raw-material stock and recorded purchase/stock costs. This capability is read-only.",
  };
}
