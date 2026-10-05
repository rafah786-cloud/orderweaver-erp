# TallyPrime Retirement Remediation Plan

## Objective and release gate

Make Mattress Maestro the authoritative accounting, inventory, tax, and historical-record system without changing production books during development. Work must occur in an isolated clone with anonymized Tally exports. Production activation requires every item in the retirement checklist to pass, accountant sign-off, tested backup/restore, and a reversible cutover.

Current verdict: **BLOCKED**. Existing live rows happen to balance, but the controls needed to guarantee future correctness are incomplete.

## 1. Accounting foundation — CRITICAL

### Atomic, server-enforced double-entry GL

- Replace browser-side voucher number allocation and multi-call saves with one restricted database operation that locks the numbering series, creates the voucher and all lines atomically, validates period/status/permissions, and commits only when total debit equals total credit within the currency precision.
- Add voucher lifecycle fields: `status` (`draft`, `posted`, `cancelled`, `reversed`), `posted_at/by`, `cancelled_at/by`, `cancellation_reason`, `reversal_voucher_id`, immutable source identifiers, and row version.
- Drafts must never affect books. Posted vouchers become immutable; corrections use cancellation plus linked reversal/replacement, preserving numbers and history.
- Enforce at least two non-zero lines, exactly one side per line, active ledgers, valid financial period, currency precision, and unique source/event idempotency in the database.
- Remove direct client posting rights; use narrowly authorized operations with maker/checker rules by role and amount.

**Dependencies:** finalized fiscal-period policy, voucher approval matrix, numbering rules.  
**Migration risks:** existing posted vouchers need status backfill; orphan/unbalanced rows must be quarantined, never silently “fixed.”  
**Tally test:** recreate sales, purchase, receipt, payment, contra, journal, debit note, credit note, stock journal, cancellation, reversal, backdated and concurrent-entry scenarios; compare day book, ledger, trial balance, sequence gaps and audit history exactly.

### Period-aware books and closing

- Replace all-time balance views with date/FY-aware reporting functions supporting opening-as-of, period movement and closing-as-of.
- Add controlled financial-year close/reopen runs with retained-earnings transfer, balance carry-forward, lock state, actor, timestamp, reason and generated voucher links.
- Prevent overlapping current years and posting outside allowed periods; admin override requires explicit approval and audit reason.

**Dependencies:** atomic GL and chart-of-accounts mapping.  
**Risks:** double-counting prior-year profit or openings during conversion.  
**Test:** compare Trial Balance, P&L and Balance Sheet for each historical FY, month and arbitrary as-of date to Tally; verify close, reopen and backdated controls.

## 2. Bill-wise receivables/payables — CRITICAL

- Add `bills` (party ledger, bill reference/date/due date, opening/new-reference type, original amount/currency, source voucher/line, status) and `bill_allocations` (settlement voucher line, bill, amount, allocation type `against_ref/new_ref/on_account/advance`, allocation date).
- Enforce party consistency, allocation sign, non-overallocation unless approved, currency consistency, and atomic posting with the receipt/payment/note voucher.
- Derive outstanding and ageing from posted bills and allocations; do not maintain independent editable `current_balance` values. Treat legacy party/supplier ledger tables as migration sources only, then reconcile or retire them.
- Persist all parsed Tally `BILLALLOCATIONS`, opening allocations and cleared references with Tally GUIDs.

**Dependencies:** atomic GL, party-ledger mapping, migration identifiers.  
**Risks:** sign interpretation, duplicate bill names, advances, credit notes, partial settlements and reopened bills.  
**Tally test:** opening bills, partial/multi-invoice receipts, advance/on-account amounts, debit/credit notes and write-offs; compare bill-by-bill outstanding and ageing bucket totals to Tally.

## 3. Inventory and manufacturing — CRITICAL

- Establish one stock ledger: stock items plus immutable stock movements. Stop treating both `raw_materials.current_stock` and `stock_movements` as independent truth; make current stock a derived balance or controlled compatibility projection.
- Add atomic inventory-document posting that reverses/reposts safely on amendment. Sales orders reserve stock only; dispatch/delivery/invoice policy creates stock-out. Purchase receipt creates stock-in. Cancellation creates reversal movements.
- Value every stock-out using the configured, fully implemented valuation method. Do not allow zero-value sale/production-out movements. Persist valuation layers for FIFO/LIFO or deterministic weighted-average snapshots; standard cost requires variance posting.
- Link production journals to BOM version, raw-material consumption, scrap/by-products and finished-goods receipt, with corresponding GL inventory/WIP/COGS postings.
- Enforce `allow_negative_stock`; exception requires role, reason and audit event.

**Dependencies:** inventory accounting policy, dispatch/GRN events, BOM versioning, GL integration.  
**Risks:** conversion quantities/rates, negative historical layers, edits to already-valued documents and rounding.  
**Tally test:** purchases, sales, returns, transfers, adjustments and production across dates/rates; compare quantity, rate, value, COGS, stock-in-hand and physical-stock reconciliation by item.

## 4. Godowns, batches and cost centres — HIGH

- Require godown on every stock movement. Implement atomic paired transfers with one transfer document and linked out/in movements; quantity and value must net to zero across locations.
- Require batch when an item tracks batches; persist Tally batch name, manufacturing/expiry dates, opening quantity/value and godown. Prevent invalid batch/godown combinations and optionally expired dispatch.
- Persist cost-centre categories, hierarchy and allocations. Add `voucher_entry_cost_allocations` if one GL line can split among centres; allocations must equal the parent line amount.

**Dependencies:** canonical inventory ledger and migration staging.  
**Risks:** Tally permits unusual negative batches and multi-allocation lines.  
**Tally test:** godown transfers, batch openings/expiry, batch-wise sales and multi-centre allocations; compare location/batch stock and cost-centre reports.

## 5. GST and statutory accounting — CRITICAL

- Model purchase taxable value and tax components explicitly at document line level; post Input CGST/SGST/IGST/cess separately rather than debiting total to Purchases.
- Use versioned tax rates by effective date, HSN/SAC, place of supply, registration type, reverse charge, ITC eligibility and rounding policy. Store the applied tax snapshot on each posted line.
- Add deterministic debit/credit note and sales/purchase return tax treatment; lock filed returns and route changes through amendments.
- Reconcile GST registers to GL tax control ledgers and exported statutory totals; e-invoice/e-way-bill status must not substitute for accounting posting.

**Dependencies:** atomic GL, invoice/purchase line model, company GST configuration.  
**Risks:** historical rate changes, interstate detection, inclusive pricing, round-off and ineligible ITC.  
**Tally test:** B2B/B2C, intra/interstate, exempt/nil-rated, reverse charge, returns and notes; compare invoice registers, HSN summary, tax ledgers and GSTR control totals.

## 6. Complete historical migration — CRITICAL

### Staging and canonical identifiers

- Create append-only `migration_runs`, uploaded-file manifests/checksums, staging tables for every master/voucher/ledger line/inventory allocation/bill allocation/tax/cost-centre/batch relation, validation issues and reconciliation snapshots.
- Preserve Tally company, GUID, master ID, alter ID, voucher key, voucher type/number/date/reference, original payload hash and relationship identifiers. Never identity-match solely by name.
- Parse every voucher leg, not only party lines. Preserve cancelled/optional/deleted states for audit rather than silently discarding them; only valid posted records affect books.

### Idempotency, commit and rollback

- Use `(company_id, tally_guid, alter_id)` and payload hash for deterministic deduplication/version detection. Re-importing identical data must produce zero accounting change.
- Stage and validate first; commit an approved migration run atomically in bounded transactions. Tag every created canonical row with the run/source version.
- Rollback means reversing/removing only an unaccepted run with dependency checks. Accepted posted history is corrected through controlled superseding entries, not destructive deletion.
- Stock import must create dated opening movements/layers; it must never overwrite live current stock.

**Dependencies:** all canonical GL, bills, tax and stock models finalized first.  
**Risks:** Tally XML variants, renamed masters, duplicate numbers, altered vouchers, sign conventions, huge exports and partial runs.  
**Tally test:** migrate multiple closed FYs plus current FY twice; verify record counts, hashes, zero duplicate impact, relationships, cancellations and exact control totals.

## 7. Reconciliation and control totals — CRITICAL

- Build signed reconciliation snapshots per migration/sync run: Trial Balance by ledger, P&L, Balance Sheet, day-book debit/credit, party/vendor control totals, bill-wise ageing, cash/bank, GST ledgers/registers, stock quantity/value by item-godown-batch, cost centres, voucher counts and number ranges.
- Differences must be traceable from summary to source Tally GUID and ERP voucher/line. Define explicit tolerances only for documented rounding; no unexplained suspense or forced balancing entries.
- Block acceptance/cutover while any critical mismatch, orphan, unbalanced voucher, duplicate source ID, missing relationship or unexplained control difference remains.

**Dependencies:** complete importer and period-aware reports.  
**Risks:** comparing reports with different dates, valuation methods or rounding settings.  
**Tally test:** export identical-date reports from Tally and independently recompute ERP controls; accountant signs each snapshot.

## 8. TallyBridge incremental parallel sync — HIGH

- Implement a local, outbound-only TallyBridge that reads altered masters/vouchers from Tally using a durable watermark (`alter_id` plus company), sends signed batches, and retains an encrypted local queue during outages.
- Backend stores sync runs, watermarks, payload hashes, retries, dead letters and acknowledgements. Processing is ordered and idempotent. Never advance a watermark until the batch is durably accepted.
- During parallel run, choose one write authority per workflow. Recommended: Tally remains accounting authority; ERP changes become controlled proposals or are frozen from accounting posting until cutover. Avoid uncontrolled bi-directional sync.
- Detect changes to previously synced vouchers and create reviewed superseding versions/reversals. Provide lag, error and reconciliation dashboards.

**Dependencies:** staging/idempotency, secure device registration, agreed authority model.  
**Risks:** split brain, offline backlog, clock drift, altered/deleted Tally vouchers and duplicate delivery.  
**Tally test:** disconnect/reconnect, resend, out-of-order batches, altered voucher, duplicate payload and bridge restart; prove exactly-once accounting effect and no watermark loss.

## 9. Audit, security and operations — HIGH

- Make accounting and stock audit logs append-only and include actor, approver, request ID, reason, old/new snapshot, source, IP/session context and linked reversal. Audit privileged imports, role changes, period overrides and restore operations.
- Separate maker, approver, accountant and administrator duties. Test every operation at database level, not only menu visibility.
- Add scheduled encrypted backups, retention policy, off-platform copies, integrity verification and documented point-in-time/full restore procedures. Run restore drills into an isolated environment and reconcile restored controls.
- Add structured monitoring for failed postings, sync lag, unbalanced/quarantined records, numbering conflicts, negative stock, failed audit writes and backup failures.
- Define performance targets and test realistic historical volume, concurrent users, month-end reports and imports. Bound batch sizes and avoid per-row network loops.

**Dependencies:** hosting recovery capabilities, role matrix, retention/legal policy.  
**Risks:** an untested backup is not a recovery plan; privileged service operations can bypass ordinary controls.  
**Tally test:** role-abuse tests, concurrent posting, forced failures, backup restore and full post-restore control reconciliation.

## 10. Medium/low remediation

### MEDIUM

- Add maker/checker approval for sensitive vouchers, master changes, period reopen, negative stock and migration acceptance.
- Fix ledger statements to calculate opening as of the selected start date.
- Implement bank-statement import matching, partial/one-to-many reconciliation and immutable reconciliation history; compare book/bank balances to Tally.
- Add controlled exports of all books and audit data in durable formats, with checksum manifests.

### LOW

- Guarantee AI audit writes or clearly flag audit failure; AI remains read-only and deterministic for accounting figures until separately approved.
- Add correlation IDs and structured operational logs. These support diagnosis but never become the accounting source of truth.

## Explicit discrepancy risks currently present

1. Unbalanced and partially saved vouchers are possible because balance validation and save atomicity are not server-enforced.
2. Concurrent voucher numbering can collide because browser allocation is racy.
3. Bill allocations are parsed but discarded; ageing and invoice settlement cannot match Tally.
4. Purchase GST is not split into input-tax ledgers.
5. Reports are cumulative rather than reliably FY/as-of based; ledger opening for a filtered period is wrong.
6. No formal year-end close/carry-forward or immutable cancellation/reversal workflow exists.
7. Two inventory stores can drift; purchase/sales edits are not consistently reversed.
8. Stock is consumed at order entry rather than dispatch/production, and outgoing movement value is zero.
9. Production statuses do not post BOM consumption or finished-goods receipt.
10. Negative-stock setting is not enforced; batch tracking and godown transfers are incomplete.
11. Tally import drops non-party voucher legs, bill-wise allocations and full historical relationships.
12. Re-import can overwrite live stock; import is non-transactional and lacks rollback/control-total acceptance.
13. No incremental Tally sync, durable watermark or split-brain prevention exists.
14. Cost-centre allocation is not operational end-to-end.
15. Backup/restore, concurrent posting, offline recovery and large-history behavior are not empirically proven.
16. Most requested transaction classes have no representative live data; UI presence is not evidence of correctness.

## Phased implementation and acceptance

1. **Freeze specifications:** accounting policies, chart mapping, valuation, tax, numbering, roles and cutover authority.
2. **Build canonical core:** atomic GL, lifecycle, periods, bill allocations and period-aware reports.
3. **Unify subledgers:** inventory/production, godowns/batches, cost centres, bank and GST posting.
4. **Build migration control plane:** staging, identifiers, validation, idempotency, commit/rollback and reconciliation.
5. **Build TallyBridge:** one-way incremental sync, monitoring and deterministic altered-record handling.
6. **Rehearse migration:** at least two full isolated dress rehearsals using production-scale exports.
7. **Parallel run:** minimum two complete month-end cycles, including GST and bank reconciliation, with daily control comparison.
8. **Cutover:** final backup/export, freeze Tally, final delta sync, reconcile, obtain signed approval, switch authority.
9. **Stabilize:** retain Tally read-only and all exports/backups through the statutory retention period; monitor daily.

## Tally Retirement Checklist — every item must PASS

- [ ] Every posted voucher is atomic, server-balanced, authorized and idempotent.
- [ ] Numbering survives concurrency; gaps/cancellations are explained and auditable.
- [ ] Posted records are immutable; cancellation, reversal and amendment preserve history.
- [ ] All voucher types and edge cases reconcile to Tally.
- [ ] Opening balances reconcile by ledger, bill, stock item, godown, batch and cost centre.
- [ ] Bill-wise receivables/payables and ageing match Tally exactly within approved rounding.
- [ ] Trial Balance balances for every migrated FY and as-of test date.
- [ ] P&L and Balance Sheet match Tally for every migrated FY and current period.
- [ ] Year close, carry-forward, lock, reopen and backdated controls pass.
- [ ] Sales and purchase GST postings, returns, notes, RCM and ITC match statutory/Tally controls.
- [ ] One canonical stock ledger is active; no unreconciled parallel stock truth remains.
- [ ] Quantity and valuation match by item, godown and batch under the approved method.
- [ ] Orders reserve only; dispatch/receipt/production/cancellation create correct stock and GL effects.
- [ ] BOM consumption, WIP, scrap and finished-goods receipt reconcile.
- [ ] Negative stock, batch requirements and godown transfers are enforced.
- [ ] Cost-centre allocations balance and reports match Tally.
- [ ] Cash and bank books match; bank reconciliation and history pass.
- [ ] Every historical Tally master, voucher leg, allocation, tax detail and relationship is preserved or documented as intentionally excluded with accountant approval.
- [ ] Re-import and incremental resend produce zero duplicate accounting effect.
- [ ] Failed migration/sync can resume or roll back without partial-book corruption.
- [ ] Reconciliation reports have no unexplained differences, suspense plugs, or hidden unmatched records.
- [ ] TallyBridge survives offline, duplicate, altered and out-of-order scenarios without split brain.
- [ ] Role, segregation-of-duties and direct-database abuse tests pass.
- [ ] Audit trail is complete, append-only, searchable and includes privileged operations.
- [ ] Production-scale concurrency, month-end report and long-history performance targets pass.
- [ ] Backup schedules, retention, integrity checks and isolated restore drill pass.
- [ ] Restored books reproduce all signed control totals.
- [ ] Two consecutive parallel-run month ends, GST cycles and bank reconciliations pass.
- [ ] Final Tally freeze, final delta, control totals and accountant/management sign-offs pass.
- [ ] Tally remains retained read-only with verified exports/backups for the statutory retention period.

No code, schema or production data changes are included in this plan.
