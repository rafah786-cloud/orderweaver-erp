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
      b.ledgerEntries.map((e) => e.external_ref).sort(),
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

describe("Tally import — stable Alter IDs", () => {
  it("preserves ALTERID from masters and vouchers for migration staging", () => {
    const xml = `<?xml version="1.0"?><ENVELOPE><BODY><DATA>
      <TALLYMESSAGE>
        <GROUP NAME="Sundry Debtors"><PARENT>Current Assets</PARENT><ALTERID>101</ALTERID></GROUP>
        <LEDGER NAME="Alter Customer"><PARENT>Sundry Debtors</PARENT><OPENINGBALANCE>10</OPENINGBALANCE><ALTERID>202</ALTERID></LEDGER>
      </TALLYMESSAGE>
      <TALLYMESSAGE>
        <VOUCHER REMOTEID="alter-voucher-1"><DATE>20261007</DATE><GUID>alter-voucher-1</GUID><ALTERID>303</ALTERID>
          <ALLLEDGERENTRIES.LIST><LEDGERNAME>Alter Customer</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-10</AMOUNT></ALLLEDGERENTRIES.LIST>
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA></BODY></ENVELOPE>`;
    const p = parseTallyMasters(xml, groups);
    expect(p.groups[0].alter_id).toBe("101");
    expect(p.customers[0].alter_id).toBe("202");
    expect(p.vouchers[0].alter_id).toBe("303");
    expect(p.ledgerEntries[0].alter_id).toBe("303");
  });
});

describe("Tally import — TallyPrime 4/5 format", () => {
  const PRIME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
  <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <LEDGER NAME="Prime Customer Pvt Ltd">
      <MAILINGNAME>Prime Customer Pvt Ltd</MAILINGNAME>
      <PARENT>Sundry Debtors</PARENT>
      <OPENINGBALANCE>5000.00</OPENINGBALANCE>
      <LEDGERCONTACT>Ravi Kumar</LEDGERCONTACT>
      <INCOMETAXNUMBER>AAAPL1234C</INCOMETAXNUMBER>
      <GSTREGDETAILS.LIST>
        <GSTIN>29ABCDE1234F1Z5</GSTIN>
      </GSTREGDETAILS.LIST>
    </LEDGER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
    <LEDGER NAME="Deleted Old Party">
      <PARENT>Sundry Debtors</PARENT>
      <ISDELETED>Yes</ISDELETED>
      <OPENINGBALANCE>999.00</OPENINGBALANCE>
    </LEDGER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
    <VOUCHER VCHTYPE="Sales" REMOTEID="prime-guid-1">
      <DATE>20250612</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>SI/001</VOUCHERNUMBER>
      <GUID>prime-guid-1</GUID>
      <PARTYLEDGERNAME>Prime Customer Pvt Ltd</PARTYLEDGERNAME>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Prime Customer Pvt Ltd</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>-1180.00</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Sales A/c</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>1000.00</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
    <VOUCHER VCHTYPE="Sales" REMOTEID="prime-guid-cancelled">
      <DATE>20250613</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>SI/002</VOUCHERNUMBER>
      <GUID>prime-guid-cancelled</GUID>
      <ISCANCELLED>Yes</ISCANCELLED>
      <PARTYLEDGERNAME>Prime Customer Pvt Ltd</PARTYLEDGERNAME>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Prime Customer Pvt Ltd</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>-9999.00</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
  </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

  it("reads TallyPrime IMPORTDATA envelope, nested GSTIN, contact person, and skips deleted/cancelled records", () => {
    const p = parseTallyMasters(PRIME_XML, groups);
    expect(p.customers).toHaveLength(1); // deleted party skipped
    const c = p.customers[0];
    expect(c.name).toBe("Prime Customer Pvt Ltd");
    expect(c.gstin).toBe("29ABCDE1234F1Z5");
    expect(c.contact_person).toBe("Ravi Kumar");
    expect(c.pan).toBe("AAAPL1234C");

    // Only the non-cancelled voucher's party line is imported (Sales A/c is not a party)
    expect(p.ledgerEntries).toHaveLength(1);
    expect(p.ledgerEntries[0].external_ref).toBe("prime-guid-1|Prime Customer Pvt Ltd");
    expect(p.ledgerEntries[0].debit).toBe(1180);
    expect(p.ledgerEntries[0].credit).toBe(0);
  });
});

describe("Tally import — bill-wise references", () => {
  it("preserves opening, settlement type, dates, signs, and stable identities", () => {
    const xml = `<?xml version="1.0"?><ENVELOPE><BODY><DATA><TALLYMESSAGE>
      <LEDGER NAME="Bills Customer"><PARENT>Sundry Debtors</PARENT>
        <OPENINGBILLALLOCATIONS.LIST><NAME>OPEN-1</NAME><BILLDATE>20260401</BILLDATE><AMOUNT>750</AMOUNT></OPENINGBILLALLOCATIONS.LIST>
      </LEDGER>
    </TALLYMESSAGE><TALLYMESSAGE><VOUCHER VCHTYPE="Receipt"><DATE>20260501</DATE><GUID>receipt-guid</GUID>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>Bills Customer</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>250</AMOUNT>
        <BILLALLOCATIONS.LIST><NAME>OPEN-1</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>-250</AMOUNT></BILLALLOCATIONS.LIST>
      </ALLLEDGERENTRIES.LIST>
    </VOUCHER></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
    const parsed = parseTallyMasters(xml, groups);
    expect(parsed.bills).toHaveLength(2);
    expect(parsed.bills[0]).toMatchObject({
      bill_name: "OPEN-1",
      bill_date: "2026-04-01",
      amount: 750,
      reference_type: "opening",
      voucher_guid: null,
    });
    expect(parsed.bills[1]).toMatchObject({
      bill_name: "OPEN-1",
      amount: -250,
      reference_type: "against_ref",
      voucher_guid: "receipt-guid",
    });
    expect(new Set(parsed.bills.map((bill) => bill.external_ref)).size).toBe(2);
  });
});
