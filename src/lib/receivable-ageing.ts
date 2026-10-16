/**
 * Standard AR/AP ageing buckets for management and collection follow-up.
 * Amounts must come from posted bill-wise balances; this module does not invent them.
 */

export type AgeingBucketId = "current" | "1-30" | "31-60" | "61-90" | "90+";

export const AGEING_BUCKETS: ReadonlyArray<{ id: AgeingBucketId; label: string; minDays: number; maxDays: number | null }> = [
  { id: "current", label: "Current (not due)", minDays: Number.NEGATIVE_INFINITY, maxDays: 0 },
  { id: "1-30", label: "1–30 days", minDays: 1, maxDays: 30 },
  { id: "31-60", label: "31–60 days", minDays: 31, maxDays: 60 },
  { id: "61-90", label: "61–90 days", minDays: 61, maxDays: 90 },
  { id: "90+", label: "Over 90 days", minDays: 91, maxDays: null },
];

export type OpenBillBalance = {
  billId: string;
  partyId: string;
  partyName: string;
  /** Calendar days past due; negative means not yet due. */
  daysPastDue: number;
  openAmount: number;
};

export type AgeingRow = {
  partyId: string;
  partyName: string;
  buckets: Record<AgeingBucketId, number>;
  total: number;
};

export type AgeingReport = {
  asOfLabel: string;
  rows: AgeingRow[];
  totals: Record<AgeingBucketId, number> & { total: number };
  skippedInvalid: number;
};

function bucketForDays(daysPastDue: number): AgeingBucketId {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

function emptyBuckets(): Record<AgeingBucketId, number> {
  return { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
}

export function buildReceivableAgeing(bills: OpenBillBalance[], asOfLabel = "as-of"): AgeingReport {
  const byParty = new Map<string, AgeingRow>();
  let skippedInvalid = 0;

  for (const bill of bills) {
    if (
      !bill.billId ||
      !bill.partyId ||
      !Number.isFinite(bill.daysPastDue) ||
      !Number.isFinite(bill.openAmount) ||
      bill.openAmount <= 0
    ) {
      skippedInvalid += 1;
      continue;
    }
    const bucket = bucketForDays(bill.daysPastDue);
    const existing = byParty.get(bill.partyId) ?? {
      partyId: bill.partyId,
      partyName: bill.partyName || bill.partyId,
      buckets: emptyBuckets(),
      total: 0,
    };
    existing.buckets[bucket] += bill.openAmount;
    existing.total += bill.openAmount;
    byParty.set(bill.partyId, existing);
  }

  const rows = [...byParty.values()].sort((a, b) => b.total - a.total || a.partyName.localeCompare(b.partyName));
  const totals = { ...emptyBuckets(), total: 0 };
  for (const row of rows) {
    for (const id of Object.keys(emptyBuckets()) as AgeingBucketId[]) {
      totals[id] += row.buckets[id];
    }
    totals.total += row.total;
  }

  return { asOfLabel, rows, totals, skippedInvalid };
}

/** Days past due from due date relative to an as-of date (YYYY-MM-DD). */
export function daysPastDue(dueDateIso: string, asOfIso: string): number {
  const due = Date.parse(dueDateIso);
  const asOf = Date.parse(asOfIso);
  if (!Number.isFinite(due) || !Number.isFinite(asOf)) {
    throw new Error("dueDate and asOf must be valid ISO dates");
  }
  return Math.floor((asOf - due) / 86_400_000);
}
