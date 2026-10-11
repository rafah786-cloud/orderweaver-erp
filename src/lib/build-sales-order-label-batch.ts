export interface SavedSalesOrderLine {
  id: string;
  model_id: string | null;
  product_name: string;
  size: string | null;
  quantity: number | string;
  unit_price: number | string;
}

export interface LabelProductModel {
  id: string;
  code: string | null;
  label_product_kind: string | null;
  extra_specs?: Record<string, unknown> | null;
  thickness?: string | null;
  cover_fabric?: string | null;
  foam_density?: string | null;
}

export interface SalesOrderLabelHeader {
  order_number: string;
  order_date: string | null;
}

export interface SalesOrderLabelBatch {
  records: Record<string, string>[];
  labelCount: number;
  excludedLines: number;
}

const MAX_LABELS_PER_BATCH = 1000;

export function buildSalesOrderLabelBatch(
  order: SalesOrderLabelHeader,
  lines: SavedSalesOrderLine[],
  models: LabelProductModel[],
): SalesOrderLabelBatch {
  if (!order.order_number?.trim()) throw new Error("The saved Sales Order number is missing.");
  if (!lines.length) throw new Error("Saved Sales Order lines could not be read.");

  const byModel = new Map(models.map((model) => [
    model.id,
    {
      code: model.code ?? null,
      kind: model.label_product_kind ?? "unclassified",
      extra: model.extra_specs && typeof model.extra_specs === "object" ? model.extra_specs : {},
      thickness: model.thickness ?? null,
      coverFabric: model.cover_fabric ?? null,
      foamDensity: model.foam_density ?? null,
    },
  ]));
  const mattressLines = lines.filter(
    (line) => !!line.model_id && byModel.get(line.model_id)?.kind === "mattress",
  );
  const excludedLines = lines.length - mattressLines.length;

  if (!mattressLines.length) {
    throw new Error("No mattress lines are classified for labels. Set the relevant models to Mattress in BOQ → Models & Recipes first.");
  }

  for (const line of mattressLines) {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unit_price);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error("A mattress line has a fractional or invalid quantity. Correct the saved Sales Order before printing one label per mattress.");
    }
    if (!line.product_name?.trim()) {
      throw new Error("A mattress line is missing its saved product name.");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("A mattress line has an invalid saved unit price.");
    }
  }

  const labelCount = mattressLines.reduce((sum, line) => sum + Number(line.quantity), 0);
  if (!Number.isSafeInteger(labelCount) || labelCount > MAX_LABELS_PER_BATCH) {
    throw new Error("This order would create more than 1,000 labels. Split the run into smaller orders.");
  }

  const records: Record<string, string>[] = [];
  for (const line of mattressLines) {
    const qty = Number(line.quantity);
    const model = byModel.get(line.model_id!)!;
    const sku = (model.code || line.model_id!.replace(/-/g, "").slice(0, 12)).slice(0, 40);
    const extra = model.extra;
    const extraString = (...keys: string[]) => {
      for (const key of keys) {
        const value = extra[key];
        if (typeof value === "string" || typeof value === "number") {
          const text = String(value).trim();
          if (text) return text;
        }
      }
      return "";
    };
    const type = extraString("Type", "type", "MattressType", "mattress_type") || "MATTRESS";
    const mfgDate = extraString("ManufacturingDate", "manufacturing_date", "MfgDate", "mfg_date");
    for (let unit = 1; unit <= qty; unit += 1) {
      const serial = "ZIZZ-" + order.order_number.replace(/[^A-Za-z0-9]/g, "") +
        "-" + line.id.replace(/-/g, "").slice(0, 12).toUpperCase() +
        "-" + String(unit).padStart(3, "0");
      records.push({
        ProductName: line.product_name,
        Model: line.product_name,
        ModelSub: extraString("ModelSub", "model_sub"),
        Type: type,
        Size: line.size ?? "",
        SizeIn: line.size ?? "",
        SizeCm: extraString("SizeCm", "size_cm", "SizeCM"),
        Brand: extraString("Brand", "brand"),
        Barcode: serial,
        SKU: sku,
        Price: Number(line.unit_price).toFixed(2),
        MRP: extraString("MRP", "mrp", "MaximumRetailPrice", "maximum_retail_price"),
        Batch: order.order_number,
        Serial: serial,
        ManufacturingDate: mfgDate,
        MfgDate: mfgDate,
        ExpiryDate: extraString("ExpiryDate", "expiry_date"),
        OrderNumber: order.order_number,
        OrderDate: order.order_date ?? "",
        UnitNumber: String(unit),
        Quantity: "1",
      });
    }
  }

  return { records, labelCount, excludedLines };
}
