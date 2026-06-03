
# Tally-Parity Buildout Plan

Bring the ERP to Tally-grade depth across four pillars: **Double-entry Accounting**, **GST Compliance**, **Inventory & Godowns**, and **Banking**. Every report drills down to the source voucher. Existing modules (invoices, purchases, parties, suppliers, payroll, Tally import, print preview) stay intact and become *sources* feeding the new general ledger.

---

## Guiding principles

- **One general ledger** is the source of truth. Existing tables (invoices, purchase_bills, payslips, party/supplier_ledger_entries) auto-post into it via triggers — no double-entry by humans for existing flows.
- **Drill-down everywhere**: every figure in TB / P&L / BS / GSTR clicks through to the voucher → to the source document.
- **No destructive schema changes** to current tables. New tables sit alongside; triggers backfill.
- **Roles**: `accountant` role added; admin gets everything; sales/production keep current access.

---

## Phase 1 — Accounting Core (Week 1–2)

Foundation. Everything else depends on it.

**Schema (new tables)**
- `ledger_groups` — Tally-style group tree (Assets, Liabilities, Income, Expenses, with parent_id and nature). Seeded with the 28 default Tally groups.
- `ledger_accounts` — chart of accounts. Each party / supplier / bank / tax / stock account is a ledger. `mapped_party_id`, `mapped_supplier_id`, `mapped_bank_id` for linkage.
- `vouchers` — header for every accounting entry. Types: `sales`, `purchase`, `receipt`, `payment`, `contra`, `journal`, `debit_note`, `credit_note`, `stock_journal`. Has `voucher_number`, `voucher_date`, `narration`, `source_table`, `source_id`, `is_locked`.
- `voucher_entries` — debit/credit lines. Must balance (trigger-enforced). Each line links to a `ledger_account_id` and optional `cost_center_id`.
- `cost_centers` — optional tagging dimension.
- `financial_years` — open/close periods; locks vouchers after year-end.
- `voucher_number_series` — per-type auto-numbering with prefix/suffix.

**Auto-posting triggers**
- `invoices` insert → sales voucher (Dr Party, Cr Sales, Cr Output CGST/SGST/IGST).
- `purchase_bills` insert → purchase voucher (Dr Purchase, Dr Input GST, Cr Supplier).
- `payslips` finalize → journal voucher (Dr Salary, Cr Employee/PF/ESI payable).
- Existing `party_ledger_entries` / `supplier_ledger_entries` from Tally import → vouchers with `source='tally_import'`.

**UI**
- `/accounting/ledgers` — chart of accounts tree view; create/edit ledgers, assign group.
- `/accounting/vouchers/new` — manual voucher entry (Tally-like single-screen form for journal/receipt/payment/contra).
- `/accounting/day-book` — chronological voucher list with filters; click row → voucher detail → click line → ledger.
- `/accounting/ledger/$id` — running balance statement for any ledger with date range.

**Reports (with drill-down)**
- Trial Balance — every figure clicks to the ledger statement → to vouchers → to source document.
- Profit & Loss — grouped by income/expense; click any line → ledger.
- Balance Sheet — assets/liabilities tree; click → ledger.

---

## Phase 2 — GST Compliance (Week 3)

Builds on Phase 1 ledgers.

**Schema**
- `hsn_codes` — HSN/SAC master with default rates.
- `gst_returns` — period (month/quarter), type (GSTR-1, GSTR-3B, GSTR-9), status, JSON payload, filed_at.
- `gst_rate_changes` — historical rate validity (so old invoices keep old rates).
- Add to `invoices` / `purchase_bills`: `place_of_supply`, `reverse_charge`, `invoice_type` (regular / export / sez / bill_of_supply), `eligibility_for_itc`.

**Engine**
- Aggregator over invoices + purchase_bills, partitioned by GSTIN and tax type, producing:
  - **GSTR-1**: B2B, B2C-L, B2C-S, exports, credit/debit notes, HSN summary, document summary.
  - **GSTR-3B**: outward + inward + ITC tables 4A/4B, tax liability ledger.
  - **HSN summary** report.

**UI**
- `/gst/returns` — list of periods + status; "Generate" button.
- `/gst/returns/$id` — full preview, drill into every B2B row → invoice → print preview.
- "Export JSON for GST Portal" button (offline filing format).
- "Export Excel" for accountant review.

**E-invoicing** (existing `e_way_bills` extended)
- Add `e_invoices` table: IRN, ack_no, ack_date, signed_qr, signed_invoice. Stub for IRP integration (manual upload now, API later).
- QR code rendered on invoice print preview when IRN exists.

---

## Phase 3 — Inventory & Godowns (Week 4)

Existing `raw_materials` and stock movement triggers stay; we add multi-location and batches.

**Schema**
- `godowns` — warehouses/locations (with parent_id for hierarchy).
- `stock_items` — replaces ad-hoc usage; raw_materials and finished products both become stock_items with `category` flag. Backward-compatible view kept.
- `stock_batches` — batch/lot tracking with mfg_date, expiry_date, batch_number.
- `stock_movements` — every in/out with godown, batch, qty, rate, value. Source = voucher_id.
- `stock_journals` — stock transfers, conversions (raw → finished), wastage.
- `stock_valuation_settings` — per-item method: FIFO / Weighted Avg / Standard Cost.

**Triggers**
- Existing purchase/sales stock triggers extended to write `stock_movements` with correct godown + batch.

**UI**
- `/inventory/godowns` — godown master.
- `/inventory/stock-items` — unified item master (replaces separate raw_materials list, keeps it as a tab filter).
- `/inventory/stock-journal/new` — transfer / convert / wastage entry.
- `/inventory/reports`:
  - **Stock Summary** — qty + value per item per godown.
  - **Movement Analysis** — for any item, every in/out with running balance. Drill → voucher → source.
  - **Batch-wise Stock** — expiry alerts.
  - **Reorder Status** — items below reorder level.
  - **Ageing Analysis** — stock held > 30/60/90/180 days.

---

## Phase 4 — Banking (Week 5)

**Schema**
- `bank_accounts` — bank name, account no, IFSC, branch, opening_balance. Maps to a ledger_account.
- `bank_transactions` — every debit/credit with date, amount, reference, narration, voucher_id (nullable for unreconciled bank-statement lines).
- `bank_reconciliation` — match status per transaction; `bank_date` vs `book_date`.
- `cheques_issued` / `cheques_received` — post-dated cheque register with status (pending/cleared/bounced/cancelled).
- `currencies` + `exchange_rates` (date-wise) for multi-currency. Add `currency_code` + `exchange_rate` to vouchers.

**UI**
- `/banking/accounts` — bank account master.
- `/banking/reconcile/$account` — split-screen: book entries (left) vs bank statement upload/manual entries (right); click to match. Auto-suggest by amount + date proximity.
- `/banking/payment-advice/new` — generate printable payment advice (uses existing print preview modal).
- `/banking/cheques` — PDC register with calendar view; trigger ledger entry on clearing.
- `/banking/cheque-print` — cheque layout template (configurable per bank). Uses existing print preview modal.
- Payment voucher already in Phase 1; bank reco closes the loop.

---

## Phase 5 — Drill-down & Polish (Week 6)

- Universal drill-down hook: every numeric cell in every report → ledger → voucher → source document (invoice/bill/payslip/stock journal).
- "Lock period" UI for accountants after GSTR filing.
- Audit trail: `voucher_audit_log` table; every edit logged (Tally Audit feature).
- Print preview integrated into every new report (already built).
- Permission matrix: `accountant` role added with full ledger access; existing roles unaffected.

---

## Technical Notes (for reviewers)

- New `accountant` role added to `app_role` enum; permissions wired into `src/lib/permissions.ts`.
- All new tables use the standard `GRANT SELECT/INSERT/UPDATE/DELETE … TO authenticated; GRANT ALL … TO service_role;` + RLS via `has_role()`.
- Voucher balance constraint enforced by `BEFORE INSERT/UPDATE` trigger on `voucher_entries` (sum of debits = sum of credits per voucher).
- Auto-posting triggers are `AFTER INSERT` and idempotent (check by `source_table` + `source_id`).
- Reports built as TanStack server functions returning DTOs; UI uses `useSuspenseQuery` + `ensureQueryData` per project conventions.
- No edge functions; everything is `createServerFn`.
- Existing Tally import (`party_ledger_entries`, `supplier_ledger_entries`, opening balances) is bridged into vouchers — re-importing produces no duplicates.

---

## What I will NOT touch

- Existing invoice / purchase / payroll / attendance / production-order UIs and schemas (they keep working; only triggers added).
- Existing print preview system (only used as-is for new reports).
- Existing Tally import flow (only adds a bridge to vouchers).

---

## Delivery order — confirm before I start

I'll ship **Phase 1 (Accounting Core)** as the first migration + UI batch. Each phase is one or two large turns. After each phase you review and approve before I move on. Reply with:

1. **"Start Phase 1"** to begin, or
2. Any phase reordering (e.g. "do GST first because filing is due"), or
3. Anything to drop from scope.
