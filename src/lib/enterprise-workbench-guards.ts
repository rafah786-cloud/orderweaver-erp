const GOVERNED_STATUSES = new Set([
  "approved",
  "awarded",
  "closed",
  "completed",
  "delivered",
  "dispatched",
  "in_transit",
  "locked",
  "obsolete",
  "paid",
  "posted",
  "reconciled",
  "released",
  "cancelled",
  "disposed",
  "conditional",
  "failed",
  "inspected",
  "passed",
  "rejected",
  "returned",
  "sent",
]);

export function normalizeWorkbenchSearch(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function getWorkbenchSearchColumns(
  fields: ReadonlyArray<{ key: string; type?: string; options?: readonly string[] }>,
): string[] {
  return [...new Set(
    fields
      .filter((field) =>
        field.key !== "id"
        && !field.key.endsWith("_id")
        && (field.type === undefined
          || field.type === "text"
          || (field.type === "select" && !(field.options?.length === 2 && field.options.every((option) => option === "true" || option === "false"))))
      )
      .map((field) => field.key),
  )];
}

export function isGovernedWorkbenchStatus(status: unknown): boolean {
  return typeof status === "string" && GOVERNED_STATUSES.has(status.trim().toLowerCase());
}

/**
 * The generic workbench is not the approval, posting, dispatch or close workflow.
 * It may retain an already-governed value while editing ordinary fields, but may
 * not create a record in a governed state or move a record into one.
 */
export function canSetWorkbenchStatus(nextStatus: unknown, currentStatus?: unknown): boolean {
  if (typeof nextStatus !== "string" || !nextStatus.trim()) return false;

  const next = nextStatus.trim().toLowerCase();
  const current = typeof currentStatus === "string" ? currentStatus.trim().toLowerCase() : "";
  const transitionTouchesGovernedState = isGovernedWorkbenchStatus(next) || isGovernedWorkbenchStatus(current);

  if (!transitionTouchesGovernedState) return true;
  return current !== "" && current === next;
}


export interface QualityInspectionValues {
  status?: unknown;
  quantity_inspected?: unknown;
  quantity_accepted?: unknown;
  quantity_rejected?: unknown;
}

/** Validate completed inspection totals before the quality workflow may set a result status. */
export function validateQualityInspection(values: QualityInspectionValues): string | null {
  const status = typeof values.status === "string" ? values.status.trim().toLowerCase() : "";
  if (!["passed", "failed", "conditional"].includes(status)) return null;

  const inspected = Number(values.quantity_inspected);
  const accepted = Number(values.quantity_accepted);
  const rejected = Number(values.quantity_rejected);
  if (![inspected, accepted, rejected].every(Number.isFinite)) {
    return "Inspection quantities must be valid finite numbers.";
  }
  if (inspected <= 0) return "A completed inspection must inspect at least one unit.";
  if (accepted < 0 || rejected < 0) return "Accepted and rejected quantities cannot be negative.";
  if (Math.abs(accepted + rejected - inspected) > 1e-6) {
    return "Accepted plus rejected quantity must equal the inspected quantity.";
  }
  if (status === "passed" && (accepted !== inspected || rejected !== 0)) {
    return "A passed inspection requires every inspected unit to be accepted and zero rejected units.";
  }
  if (status === "failed" && rejected <= 0) {
    return "A failed inspection must record at least one rejected unit.";
  }
  return null;
}


export interface WorkbenchFieldRule {
  label: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
}

/** Validate generic workbench input before it reaches Supabase. */
export function validateWorkbenchFieldValue(field: WorkbenchFieldRule, raw: string): string | null {
  const value = raw.trim();
  if (!value && field.required) return field.label + " is required.";
  if (!value) return null;

  if (field.type === "number") {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return field.label + " must be a valid number.";
    if (field.min !== undefined && numericValue < field.min) return field.label + " must be at least " + field.min + ".";
    if (field.max !== undefined && numericValue > field.max) return field.label + " must be no more than " + field.max + ".";
  }
  if ((field.type === "date" || field.type === "datetime") && Number.isNaN(Date.parse(value))) {
    return field.label + " must be a valid date/time.";
  }
  return null;
}

/** Reject inverted planning and effective-date ranges before saving. */
export function validateWorkbenchDateRanges(values: Readonly<Record<string, string>>): string | null {
  for (const [startKey, endKey, startLabel, endLabel] of [
    ["horizon_start", "horizon_end", "Planning start", "Planning end"],
    ["effective_from", "effective_to", "Effective from", "Effective to"],
  ] as const) {
    const start = values[startKey]?.trim();
    const end = values[endKey]?.trim();
    if (!start || !end) continue;
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (Number.isFinite(startTime) && Number.isFinite(endTime) && startTime > endTime) {
      return startLabel + " cannot be after " + endLabel.toLowerCase() + ".";
    }
  }
  return null;
}
