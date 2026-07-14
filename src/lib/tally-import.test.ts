import { describe, it, expect } from "vitest";
import { parseTallyMasters } from "./tally-import";
import { chunkInsert } from "./tally-import.functions";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE><BODY><DATA>
  <TALLYMESSAGE>
    <LEDGER NAME="Acme Traders">
      <PARENT>Sundry Debtors</PARENT>
      <OPENINGBALANCE>1000.00</OPENINGBALANCE>
      <CLOSINGBALANCE>1500.00</CLOSINGBALANCE>
    </LEDGER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
    <VOUCHER VCHTYPE="Sales" REMOTEID="voucher-guid-1">
      <DATE>20240415</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>S/001</VOUCHERNUMBER>
      <GUID>voucher-guid-1</GUID>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Acme Traders</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>-500.00</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
    <VOUCHER VCHTYPE="Receipt" REMOTEID="voucher-guid-2">
      <DATE>20240420</DATE>
      <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
      <VOUCHERNUMBER>R/007</VOUCHERNUMBER>
      <GUID>voucher-guid-2</GUID>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Acme Traders</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>200.00</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
  </TALLYMESSAGE>
</DATA></BODY></ENVELOPE>`;

const groups = { rawGroups: ["Raw Materials"], finishedGroups: ["Finished Goods"] };

/**
 * Fake Supabase client that enforces a unique index on `external_ref`,
 * mirroring the production `party_ledger_entries_external_ref_uq` /
 * `supplier_ledger_entries_external_ref_uq` indexes.
 */
function makeFakeSupabase() {
  const tables: Record<string, { rows: Record<string, unknown>[]; refs: Set<string> }> = {
    party_ledger_entries: { rows: [], refs: new Set() },
    supplier_ledger_entries: { rows: [], refs: new Set() },
  };
  return {
    tables,
    from(table: string) {
      const t = tables[table];
      return {
        insert(input: Record<string, unknown> | Record<string, unknown>[]) {
          const rows = Array.isArray(input) ? input : [input];
          // Simulate a Postgres batch insert: any duplicate aborts the whole batch,
          // exactly like the real unique index does.
          for (const r of rows) {
            const ref = r.external_ref as string | undefined;
            if (ref && t.refs.has(ref)) {
              return Promise.resolve({
                error: { message: "duplicate key value violates unique constraint" },
              });
            }
          }
          for (const r of rows) {
            t.rows.push(r);
            const ref = r.external_ref as string | undefined;
            if (ref) t.refs.add(ref);
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

describe("Tally import — idempotent re-import", () => {
  it("parser produces stable external_ref values across re-parses", () => {
    const a = parseTallyMasters(SAMPLE_XML, groups);
    const b = parseTallyMasters(SAMPLE_XML, groups);
    expect(a.ledgerEntries).toHaveLength(2);
    expect(a.ledgerEntries.map((e) => e.external_ref).sort()).toEqual(
      b.ledgerEntries.map((e) => e.external_ref).sort()
    );
    // GUID + ledger name form the external_ref, matching the DB unique index.
    for (const e of a.ledgerEntries) {
      expect(e.external_ref).toMatch(/voucher-guid-[12]\|Acme Traders/);
    }
  });

  it("re-inserting the same rows does not create duplicates or change balances", async () => {
    const parsed = parseTallyMasters(SAMPLE_XML, groups);
    const rows = parsed.ledgerEntries.map((e) => ({
      party_id: "party-1",
      entry_date: e.entry_date,
      voucher_type: e.voucher_type,
      voucher_number: e.voucher_number,
      debit: e.debit,
      credit: e.credit,
      narration: e.narration,
      source: "tally",
      external_ref: e.external_ref,
    }));

    const fake = makeFakeSupabase();

    const first = await chunkInsert(fake, "party_ledger_entries", rows);
    expect(first.errors).toEqual([]);
    expect(first.inserted).toBe(rows.length);
    expect(fake.tables.party_ledger_entries.rows).toHaveLength(rows.length);

    const balanceAfterFirst = fake.tables.party_ledger_entries.rows.reduce(
      (acc, r) => acc + Number(r.debit ?? 0) - Number(r.credit ?? 0),
      0,
    );

    // Second pass with the identical parsed payload — must be a no-op.
    const second = await chunkInsert(fake, "party_ledger_entries", rows);
    expect(second.errors).toEqual([]);
    expect(second.inserted).toBe(0);
    expect(fake.tables.party_ledger_entries.rows).toHaveLength(rows.length);

    const balanceAfterSecond = fake.tables.party_ledger_entries.rows.reduce(
      (acc, r) => acc + Number(r.debit ?? 0) - Number(r.credit ?? 0),
      0,
    );
    expect(balanceAfterSecond).toBe(balanceAfterFirst);
  });
});
