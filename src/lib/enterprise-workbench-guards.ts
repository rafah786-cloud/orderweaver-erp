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
]);

export function normalizeWorkbenchSearch(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function getWorkbenchSearchColumns(
  fields: ReadonlyArray<{ key: string; type?: string }>,
): string[] {
  return [...new Set(
    fields
      .filter((field) => field.type === undefined || field.type === "text" || field.type === "select")
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
  if (!isGovernedWorkbenchStatus(nextStatus)) return true;

  return typeof currentStatus === "string"
    && currentStatus.trim().toLowerCase() === nextStatus.trim().toLowerCase();
}
