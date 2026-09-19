# Phase 1 Validation Remediation and Phase 2 Initiation

## Objective

Remove the repository-side blockers to managed Phase 1 validation, then implement Phase 2 bill-wise receivables/payables as an isolated migration and test suite. Do not apply either phase to the shared production database, switch existing ERP screens, or begin inventory/GST/TallyBridge work.

## 1. Make Phase 1 validation reproducible

- Commit a database test harness that applies the existing schema history, then applies `accounting-phase1/001_accounting_foundation.sql` byte-for-byte to a disposable database.
- Commit synthetic fixtures and the complete 25-test suite covering concurrency, rollback, idempotency, lifecycle, period controls, atomic invoice/purchase posting, and reconciliation.
- Add fail-closed environment guards so the runner refuses the production/preview database and requires an explicitly supplied test database URL.
- Add managed-environment checks for authenticated roles, RLS, API grants, direct-write denial, and pooled concurrent calls.
- Add preflight SQL for overlapping financial years, duplicate source/idempotency identifiers, missing/inactive posting ledgers, legacy unbalanced vouchers, and known direct voucher-write call sites.
- Run the suite locally again. Managed-host parity remains BLOCKED until a separate managed test project is connected; no substitute result will be reported as managed validation.

## 2. Phase 2 isolated accounting model

Create a separate, unapplied Phase 2 migration that depends on Phase 1 and adds:

- `bill_party_kind`, `bill_reference_type`, `bill_status`, and `bill_allocation_type` enums.
- `bills` as the canonical receivable/payable document record, linked to exactly one customer or supplier ledger, its posted source voucher/line, original amount, currency, bill/reference/due dates, status, and stable external identity.
- `bill_allocations` linked to a posted settlement voucher line, with allocation type, date, amount, idempotency key, and strict party/currency/sign/non-overallocation validation.
- Explicit GRANT statements, RLS, indexes, and role policies for every new table.
- Database operations that atomically create bills with posted sales/purchase vouchers and atomically create receipt/payment vouchers with allocations.
- Cancellation/reversal handling that preserves history and reverses bill effects rather than deleting final records.
- Derived customer and supplier outstanding/ageing functions for any as-of date; editable `current_balance` fields and legacy party/supplier ledgers remain compatibility sources only and are not used as accounting truth.

## 3. Tally opening-bill preservation

- Extend the parser model to distinguish opening bills, new references, against-reference allocations, on-account amounts, advances, and cleared references instead of flattening all bill lists.
- Preserve Tally bill date, reference, stable voucher identity, amount/sign, and party identity without inventing missing values.
- Extend the isolated import contract so parsed bill records can be staged for Phase 2; do not send them into production tables or overwrite current balances.

## 4. Phase 2 database tests

Run isolated database tests for:

- Customer and supplier opening bills.
- Sales/purchase bill creation and exact GL linkage.
- Full, partial, multi-invoice, advance, and on-account settlement.
- Debit/credit note allocation and reversal/cancellation effects.
- Duplicate/idempotent allocation delivery.
- Wrong-party, wrong-currency, wrong-sign, and over-allocation rejection.
- Concurrent settlement of the same bill.
- As-of outstanding and ageing bucket totals reconciled to posted GL party ledgers.
- RLS, role, GRANT, immutability, and direct-write denial.

## Deliverables and release boundary

- Durable Phase 1 database runner, fixtures, preflight checks, and updated validation report.
- Isolated Phase 2 migration, parser/import contract changes, server-side accounting functions where needed, and tests.
- Updated roadmap and exact PASS/FAIL/PARTIAL/BLOCKED report with changed files and migration risks.
- No production schema/data changes, no live migration application, no screen/workflow cutover, and no Phase 3 work.

## Technical notes

- Phase 2 references the Phase 1 `vouchers`, `voucher_entries`, and atomic posting functions; it does not create a parallel GL.
- Existing invoice `paid_amount`, party/supplier `current_balance`, and legacy subledger rows remain readable for compatibility but cannot drive canonical outstanding totals.
- A separately provisioned managed test project is still required before either phase can be promoted. Once connected, the same committed runner will execute there without changing the approved Phase 1 SQL.
