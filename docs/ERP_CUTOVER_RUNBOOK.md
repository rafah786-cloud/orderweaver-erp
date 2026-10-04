# Mattress Maestro — Production Cutover Runbook

NOT STARTED. Do not execute this runbook. Tally remains the accounting authority.

This runbook is intentionally fail-closed. It does not authorize a production migration by itself.

## 1. Freeze and backup

- Freeze accounting/inventory writes for the maintenance window.
- Capture a complete production backup/export.
- Verify the backup can be restored before proceeding.
- Record the exact backup timestamp and database/schema version.

## 2. Read-only preflight

Record before-change totals for:

- voucher count and debit/credit totals
- unbalanced vouchers
- duplicate voucher numbers
- voucher number series
- financial years and locked periods
- customer balances
- supplier balances
- invoice totals and paid amounts
- bill and allocation counts
- stock quantities and stock movements
- stock valuation where available
- posting ledger availability
- direct-write grants/policies

Any unexplained discrepancy stops the cutover.

## 3. Compatibility migration

Apply only migrations that are explicitly marked production-compatible after schema inspection. Never apply the old Phase 1/2/3 drafts merely because they pass fixture tests.

Historical records must not be rewritten except for metadata changes that have been proven harmless and explicitly approved.

## 4. Activation order

1. Database primitives and constraints.
2. Voucher posting/idempotency functions.
3. Bill/receipt/payment allocation functions.
4. Inventory movement/value functions.
5. Document-state columns and workflow integration.
6. Reporting functions/views.
7. Screen cutover from direct writes to canonical functions.
8. Security/RLS/grant verification.

Each step must be independently verifiable and reversible.

## 5. Post-activation reconciliation

Immediately rerun the preflight and compare against the captured baseline.

Required invariants:

- historical voucher debit/credit totals unchanged
- historical bill count and amounts unchanged unless an explicitly approved migration creates metadata only
- no duplicate vouchers
- no duplicate bill allocations
- no unexplained stock quantity/value movement
- number series never move backwards
- all new posting paths are idempotent
- trial balance remains balanced

## 6. Business acceptance tests

Execute real test transactions with controlled values:

- sales invoice, including zero-tax and each supported GST component combination
- customer receipt: full, partial and advance
- purchase bill and receipt
- supplier payment: full, partial and advance
- credit/debit note and reversal
- stock receipt
- stock issue/delivery
- godown transfer
- production component consumption
- finished-goods receipt
- cancellation and reversal
- backdated transaction in open FY
- rejected transaction in closed FY

Reconcile every test transaction to the GL, bill ledger and stock ledger.

## 7. Tally comparison

Before retiring Tally, compare by financial year:

- Trial Balance
- Profit & Loss
- Balance Sheet
- receivables
- payables
- cash/bank
- stock quantity
- stock value
- GST totals
- bill-wise outstanding

Every difference must have a documented explanation and owner.

## 8. Rollback

If any critical invariant fails, stop new posting, preserve the diagnostic evidence, restore using the verified recovery procedure, and return the application to the previous posting path. Never attempt an ad-hoc SQL reversal of an incomplete schema migration.
