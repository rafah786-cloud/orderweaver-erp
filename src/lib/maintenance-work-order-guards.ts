/** Validate completion of a maintenance work order before recording downtime/costs. */
export interface MaintenanceCompletionValues {
  resolution?: unknown;
  downtimeMinutes?: unknown;
  laborCost?: unknown;
  partsCost?: unknown;
  otherCost?: unknown;
}

export function validateMaintenanceCompletion(values: MaintenanceCompletionValues): string | null {
  if (typeof values.resolution !== "string" || values.resolution.trim().length < 10) {
    return "Record a resolution of at least 10 characters before completing this work order.";
  }
  for (const [label, value] of [
    ["Downtime minutes", values.downtimeMinutes],
    ["Labour cost", values.laborCost],
    ["Parts cost", values.partsCost],
    ["Other cost", values.otherCost],
  ] as const) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number) || number < 0) return label + " must be a non-negative finite number.";
  }
  return null;
}
