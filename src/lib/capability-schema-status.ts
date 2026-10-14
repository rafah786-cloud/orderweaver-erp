export type CapabilityTableStatus = "available" | "not-installed" | "unavailable";

/** Distinguish absent schema from access/network failures without hiding either. */
export function classifyCapabilityTableError(error: unknown): Exclude<CapabilityTableStatus, "available"> {
  if (!error || typeof error !== "object") return "unavailable";
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  const message = [record.message, record.details].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  if (code === "42P01" || code === "PGRST205" || /relation .* does not exist|could not find the table|table .* not found/.test(message)) {
    return "not-installed";
  }
  return "unavailable";
}
