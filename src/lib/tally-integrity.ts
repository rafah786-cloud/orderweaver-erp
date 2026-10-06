import type { TallyParsed } from "./tally-import";

export type TallyIntegrity = {
  voucherCount: number;
  debit: number;
  credit: number;
  errors: string[];
};

/** Pure, read-only preflight. Never repairs, maps or posts source transactions. */
export function inspectTallyAccounting(data: TallyParsed): TallyIntegrity {
  const errors: string[] = [];
  const seen = new Set<string>();
  let debit = 0;
  let credit = 0;
  for (const voucher of data.vouchers) {
    const label = `${voucher.voucher_type ?? "Unknown"} ${voucher.voucher_number ?? "(unnumbered)"} [${voucher.source_id}]`;
    if (!voucher.has_stable_id) errors.push(`${label}: stable Tally GUID/REMOTEID missing`);
    if (seen.has(voucher.source_id)) errors.push(`${label}: duplicate source identifier`);
    seen.add(voucher.source_id);
    if (voucher.entries.length < 2) errors.push(`${label}: fewer than two ledger lines`);
    const dr = voucher.entries.reduce((sum, entry) => sum + entry.debit, 0);
    const cr = voucher.entries.reduce((sum, entry) => sum + entry.credit, 0);
    debit += dr;
    credit += cr;
    if (voucher.entries.some((entry) => !entry.ledger_name))
      errors.push(`${label}: ledger name missing`);
    if (Math.abs(dr - cr) > 0.01 || dr <= 0)
      errors.push(`${label}: unbalanced debit ${dr.toFixed(2)} / credit ${cr.toFixed(2)}`);
  }
  const billRefs = new Set<string>();
  for (const bill of data.bills) {
    if (billRefs.has(bill.external_ref))
      errors.push(
        `${bill.party_name} / ${bill.bill_name}: duplicate bill reference ${bill.external_ref}`,
      );
    billRefs.add(bill.external_ref);
    if (bill.reference_type === "against_ref" && !bill.voucher_guid)
      errors.push(`${bill.party_name} / ${bill.bill_name}: settlement without source voucher`);
  }
  return { voucherCount: data.vouchers.length, debit, credit, errors };
}
