const INDIA_TIME_ZONE = "Asia/Kolkata";

export function inr(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

/**
 * ERP business timezone. Database timestamps remain UTC; this helper is only
 * for deriving/displaying Indian business dates consistently.
 */
export function todayIndia(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(
  d: string | Date | null | undefined,
  options: { seconds?: boolean } = {},
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(options.seconds ? { second: "2-digit" as const } : {}),
  });
}

export function daysBetween(from: string | Date, to: Date = new Date()): number {
  const f = typeof from === "string" ? new Date(from) : from;
  return Math.floor((to.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
}
