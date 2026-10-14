import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/lib/company-context";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ClipboardList, Boxes, PackageCheck } from "lucide-react";
import { explodeMaterialRequirements, type MrpBomLine, type MrpDemandLine, type MrpMaterialBalance } from "@/lib/mrp-explosion";
import { selectEffectiveReleasedBomRevisions, type BomRevisionCandidate } from "@/lib/mrp-bom-source";

export const Route = createFileRoute("/_app/mrp")({
  head: () => ({ meta: [
    { title: "Material Requirements | Mattress Maestro ERP" },
    { name: "description", content: "Read-only production material requirements preview." },
    { property: "og:title", content: "Material Requirements | Mattress Maestro ERP" },
    { property: "og:description", content: "Read-only production material requirements preview." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MrpPage,
});

type ProductionOrder = { id: string; production_number: string; status: string; sales_order_id: string };
type SalesItem = { sales_order_id: string; model_id: string | null; product_name: string; quantity: number };
type ProductModel = { id: string; name: string };
type RawMaterial = { id: string; name: string; unit: string };
type StockItem = { id: string; name: string; unit: string };
type BomRevision = BomRevisionCandidate;
type BomRevisionLine = { bom_revision_id: string; raw_material_id: string | null; stock_item_id: string | null; quantity_per_unit: number; scrap_pct: number };

function MrpPage() {
  const { hasAnyRole } = useAuth();
  const { activeCompany, loading: companyLoading } = useCompany();
  const canView = hasAnyRole(["admin", "production", "accountant"]);
  const query = useQuery({
    queryKey: ["mrp-gross-requirements", activeCompany?.id],
    enabled: canView && !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select an active company to calculate requirements.");
      const { data: ordersData, error: ordersError } = await supabase
        .from("production_orders")
        .select("id, production_number, status, sales_order_id")
        .eq("company_id", activeCompany.id)
        .in("status", ["received", "in_production", "qc"])
        .order("created_at", { ascending: true });
      if (ordersError) throw ordersError;
      const orders = (ordersData ?? []) as ProductionOrder[];
      const salesOrderIds = [...new Set(orders.map((o) => o.sales_order_id).filter(Boolean))];
      if (!salesOrderIds.length) return { orders, result: explodeMaterialRequirements([], [], []) };

      const { data: itemData, error: itemError } = await supabase
        .from("sales_order_items")
        .select("sales_order_id, model_id, product_name, quantity")
        .eq("company_id", activeCompany.id)
        .in("sales_order_id", salesOrderIds);
      if (itemError) throw itemError;
      const items = (itemData ?? []) as SalesItem[];
      const modelIds = [...new Set(items.map((i) => i.model_id).filter((id): id is string => Boolean(id)))];
      const [modelsResponse, legacyBomResponse, revisionsResponse, materialsResponse, stockItemsResponse] = await Promise.all([
        modelIds.length ? supabase.from("product_models").select("id, name").eq("company_id", activeCompany.id).in("id", modelIds) : Promise.resolve({ data: [], error: null }),
        modelIds.length ? supabase.from("model_boq").select("model_id, raw_material_id, quantity_per_unit").eq("company_id", activeCompany.id).in("model_id", modelIds) : Promise.resolve({ data: [], error: null }),
        modelIds.length ? supabase.from("bom_revisions").select("id, model_id, revision, status, effective_from, effective_to").eq("company_id", activeCompany.id).in("model_id", modelIds) : Promise.resolve({ data: [], error: null }),
        supabase.from("raw_materials").select("id, name, unit").eq("company_id", activeCompany.id),
        supabase.from("stock_items").select("id, name, unit").eq("company_id", activeCompany.id),
      ]);
      if (modelsResponse.error) throw modelsResponse.error;
      if (legacyBomResponse.error) throw legacyBomResponse.error;
      if (revisionsResponse.error) throw revisionsResponse.error;
      if (materialsResponse.error) throw materialsResponse.error;
      if (stockItemsResponse.error) throw stockItemsResponse.error;

      const models = (modelsResponse.data ?? []) as ProductModel[];
      const rawMaterials = (materialsResponse.data ?? []) as RawMaterial[];
      const stockItems = (stockItemsResponse.data ?? []) as StockItem[];
      const revisions = (revisionsResponse.data ?? []) as BomRevision[];
      const modelName = new Map(models.map((m) => [m.id, m.name]));
      const materialById = new Map(rawMaterials.map((m) => [m.id, m]));
      const stockItemById = new Map(stockItems.map((m) => [m.id, m]));
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const selection = selectEffectiveReleasedBomRevisions(modelIds, revisions, today);
      const selectedRevisionByModel = selection.selectedByModel;
      const missingEffectiveRevisionModels = selection.missingEffectiveRevisionModelIds.map((id) => modelName.get(id) ?? id);
      const selectedRevisionIds = [...selectedRevisionByModel.values()].map((revision) => revision.id);
      const revisionLinesResponse = selectedRevisionIds.length
        ? await supabase.from("bom_revision_lines").select("bom_revision_id, raw_material_id, stock_item_id, quantity_per_unit, scrap_pct").eq("company_id", activeCompany.id).in("bom_revision_id", selectedRevisionIds)
        : { data: [], error: null };
      if (revisionLinesResponse.error) throw revisionLinesResponse.error;

      const revisionLines = (revisionLinesResponse.data ?? []) as BomRevisionLine[];
      const missingBomMaterialNames: string[] = [];
      const scrapFactorNotes: string[] = [];
      const bom: MrpBomLine[] = [];
      for (const [modelId, revision] of selectedRevisionByModel) {
        const lines = revisionLines.filter((line) => line.bom_revision_id === revision.id);
        for (const line of lines) {
          if (line.scrap_pct > 0) scrapFactorNotes.push(`${modelName.get(modelId) ?? modelId} revision ${revision.revision} has a scrap factor (${line.scrap_pct}%) that is not applied in this preview.`);
          if (Boolean(line.raw_material_id) === Boolean(line.stock_item_id)) {
            missingBomMaterialNames.push(`Invalid component mapping in ${modelName.get(modelId) ?? modelId} revision ${revision.revision}`);
            continue;
          }
          if (!Number.isFinite(Number(line.quantity_per_unit)) || Number(line.quantity_per_unit) <= 0) {
            missingBomMaterialNames.push(`Invalid component quantity in ${modelName.get(modelId) ?? modelId} revision ${revision.revision}`);
            continue;
          }
          if (line.raw_material_id) {
            const material = materialById.get(line.raw_material_id);
            if (!material) {
              missingBomMaterialNames.push(`Unknown raw material (${line.raw_material_id}) in revision ${revision.revision}`);
              continue;
            }
            bom.push({ productModelId: modelId, rawMaterialId: `raw:${material.id}`, rawMaterialName: material.name, unit: material.unit, quantityPerFinishedUnit: Number(line.quantity_per_unit) });
          } else if (line.stock_item_id) {
            const item = stockItemById.get(line.stock_item_id);
            if (!item) {
              missingBomMaterialNames.push(`Unknown stock item (${line.stock_item_id}) in revision ${revision.revision}`);
              continue;
            }
            bom.push({ productModelId: modelId, rawMaterialId: `stock:${item.id}`, rawMaterialName: item.name, unit: item.unit, quantityPerFinishedUnit: Number(line.quantity_per_unit) });
          }
        }
      }

      // Fall back to the legacy model BOQ only when no governed BOM revision exists for that model.
      // If revisions exist but none is released/effective, fail closed instead of planning from stale legacy data.
      const modelsWithAnyRevision = new Set(revisions.map((revision) => revision.model_id));
      const legacyBomRows = (legacyBomResponse.data ?? []).filter((line) => !modelsWithAnyRevision.has(line.model_id));
      for (const line of legacyBomRows) {
        const material = materialById.get(line.raw_material_id);
        if (!material) {
          missingBomMaterialNames.push(`Unknown raw material (${line.raw_material_id}) in legacy BOQ`);
          continue;
        }
        if (!Number.isFinite(Number(line.quantity_per_unit)) || Number(line.quantity_per_unit) <= 0) {
          missingBomMaterialNames.push(`Invalid component quantity in legacy BOQ for ${modelName.get(line.model_id) ?? line.model_id}`);
          continue;
        }
        bom.push({ productModelId: line.model_id, rawMaterialId: `raw:${material.id}`, rawMaterialName: material.name, unit: material.unit, quantityPerFinishedUnit: Number(line.quantity_per_unit) });
      }
            // A production order points to its sales order, but has no quantity column. Count each sales order once,
      // then explode its ordered line quantities; this avoids double-counting if an order has multiple production records.
      const uniqueOrderBySalesId = new Map<string, ProductionOrder>();
      for (const order of orders) if (!uniqueOrderBySalesId.has(order.sales_order_id)) uniqueOrderBySalesId.set(order.sales_order_id, order);
      const demand: MrpDemandLine[] = [];
      const unmappedDemandNames: string[] = [];
      const invalidDemandNames: string[] = [];
      for (const item of items) {
        const order = uniqueOrderBySalesId.get(item.sales_order_id);
        if (!order) continue;
        if (!item.model_id) {
          unmappedDemandNames.push(item.product_name || "Unnamed sales item");
          continue;
        }
        const orderQuantity = Number(item.quantity);
        if (!Number.isFinite(orderQuantity) || orderQuantity <= 0) {
          invalidDemandNames.push(item.product_name || modelName.get(item.model_id) || item.model_id);
          continue;
        }
        demand.push({ productionOrderId: order.id, productionOrderNumber: order.production_number, productModelId: item.model_id, productModelName: modelName.get(item.model_id) ?? item.product_name, orderQuantity });
      }
      const balances: MrpMaterialBalance[] = [
        ...rawMaterials.map((m) => ({ rawMaterialId: `raw:${m.id}`, rawMaterialName: m.name, unit: m.unit, availableQuantity: null })),
        ...stockItems.map((m) => ({ rawMaterialId: `stock:${m.id}`, rawMaterialName: m.name, unit: m.unit, availableQuantity: null })),
      ];
      const result = explodeMaterialRequirements(demand, bom, balances);
      if (unmappedDemandNames.length) {
        result.status = "insufficient-data";
        result.missingBomModels = [...new Set([...result.missingBomModels, ...unmappedDemandNames.map((name) => `Unmapped sales item: ${name}`)])].sort();
        result.notes.push("Some sales-order lines have no product-model mapping and are excluded; other valid mapped demand is still calculated.");
      }
      if (invalidDemandNames.length) {
        result.status = "insufficient-data";
        result.notes.push(`Invalid or non-positive quantities were excluded for: ${[...new Set(invalidDemandNames)].join(", ")}.`);
      }
      if (missingEffectiveRevisionModels.length) {
        result.status = "insufficient-data";
        result.missingBomModels = [...new Set([...result.missingBomModels, ...missingEffectiveRevisionModels.map((name) => `${name} (no effective released revision)`)])].sort();
        result.notes.push("Some models have BOM revisions but none is released and effective today; legacy BOQs were not used as a fallback for those models.");
      }
      if (missingBomMaterialNames.length) {
        result.status = "insufficient-data";
        result.missingMaterialMasters = [...new Set([...result.missingMaterialMasters, ...missingBomMaterialNames])].sort();
        result.notes.push("Some BOM components are invalid or missing/inaccessible in the active company; affected requirements are excluded.");
      }
      if (scrapFactorNotes.length) {
        result.status = "insufficient-data";
        result.notes.push("Scrap factors exist on released BOM revisions but are not applied by this preview.");
        
      }
      return { orders, result };
    },
  });

  if (!canView) return <><PageHeader title="Material Requirements Planning" description="Access restricted." /><PageBody><div role="alert" className="rounded-lg border p-4 text-sm">Your role does not have permission to view material planning.</div></PageBody></>;

  const result = query.data?.result;
  return <>
    <PageHeader title="Material Requirements Planning" description="Read-only gross requirements using effective released BOM revisions where available." actions={<Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching || companyLoading} className="min-h-11"><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    <PageBody>
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm"><div className="font-semibold">Planning preview — no stock changes</div><p className="mt-1 text-muted-foreground">This preview uses the latest effective released BOM revision when one exists. It uses the legacy per-model BOQ only when no BOM revision exists for that model. Scrap factors are not applied, and the preview never reserves stock, creates purchase orders, or posts inventory. Available stock is intentionally not netted because the current-stock field is not a verified reservation-aware planning balance.</p></div>
      </div>
      {companyLoading && <div role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">Loading active company…</div>}
      {!companyLoading && !activeCompany?.id && <div role="alert" className="rounded-lg border p-4 text-sm">Select an active company to continue.</div>}
      {query.isError && <div role="alert" className="mb-4 flex flex-col gap-3 rounded-lg border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><span>Could not calculate requirements: {query.error instanceof Error ? query.error.message : "Unknown error"}</span></div><Button variant="outline" onClick={() => void query.refetch()} className="min-h-11"><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></div>}
      {query.isLoading && <div role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">Loading production demand, BOMs, and material masters…</div>}
      {query.isSuccess && result && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><ClipboardList className="h-4 w-4" />Active production orders</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{query.data.orders.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Boxes className="h-4 w-4" />Material lines</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{result.requirements.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><PackageCheck className="h-4 w-4" />Data readiness</CardTitle></CardHeader><CardContent><div className="text-sm font-semibold">{result.status === "calculated" ? "BOM data complete" : "Review required"}</div></CardContent></Card>
        </div>
        {result.status === "insufficient-data" && <div role="alert" className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><div className="font-semibold">Some requirements are incomplete</div><ul className="mt-2 list-disc space-y-1 pl-5">{result.notes.map((note) => <li key={note}>{note}</li>)}{result.missingBomModels.map((name) => <li key={name}>Missing BOM: {name}</li>)}{result.missingMaterialMasters.map((name) => <li key={name}>Missing or incompatible material master: {name}</li>)}</ul></div>}
        {query.data.orders.length === 0 ? <div className="mt-4 rounded-lg border p-8 text-center"><ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><div className="font-semibold">No active production demand</div><p className="mt-1 text-sm text-muted-foreground">Orders in Received, In Production, or QC will appear here.</p></div> : result.requirements.length === 0 ? <div className="mt-4 rounded-lg border p-6 text-sm text-muted-foreground">No material requirements could be calculated. Review sales-order model mapping and BOM setup above.</div> : <div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/50"><tr className="text-left"><th className="p-3 font-semibold">Raw material</th><th className="p-3 font-semibold">Unit</th><th className="p-3 text-right font-semibold">Gross required</th><th className="p-3 font-semibold">Source production orders</th><th className="p-3 font-semibold">Availability</th></tr></thead><tbody>{result.requirements.map((line) => <tr key={line.rawMaterialId} className="border-t"><td className="p-3 font-medium">{line.rawMaterialName}</td><td className="p-3">{line.unit}</td><td className="p-3 text-right tabular-nums">{line.grossRequired.toLocaleString("en-IN", { maximumFractionDigits: 6 })}</td><td className="p-3">{[...new Set(line.sourceOrders.map((o) => o.productionOrderNumber))].join(", ") || "—"}</td><td className="p-3 text-muted-foreground">Not netted (ledger/reservations not connected)</td></tr>)}</tbody></table></div>}
        <p className="mt-3 text-xs text-muted-foreground">Calculation excludes scrap/yield, issued material, reservations, open purchase supply, subassemblies, lead times, and machine capacity. Validate the active engineering revision before using these figures for purchasing or production commitments.</p>
      </>}
    </PageBody>
  </>;
}
