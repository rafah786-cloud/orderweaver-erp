# Mattress Maestro — Production Readiness Contract

## Purpose

This document is the engineering gate for making Mattress Maestro a production-grade ERP and a credible TallyPrime replacement. It separates **business-document capture** from **posted accounting/inventory truth** and prevents silent partial posting.

## Core accounting rules

1. Every posted accounting transaction is double-entry and balanced.
2. Voucher numbering is allocated atomically inside the database transaction.
3. Idempotency keys are separate from human/business references.
4. Posted vouchers and voucher lines are immutable; corrections use cancellation/reversal documents.
5. Financial-year boundaries and closed-period controls are enforced server-side.
6. Customer and supplier receivables/payables are derived from posted ledger activity plus explicit bill allocations, not mutable current-balance fields.
7. Tax is posted only from explicit stored tax components. Aggregate tax must never be split by guesswork.
8. Source documents remain traceable to their GL entries.

## Core inventory rules

1. `stock_movements` is the authoritative movement ledger.
2. New receipts/issues/transfers never directly overwrite `raw_materials.current_stock`.
3. Every valued movement records quantity, unit cost and total value.
4. Issues are valued using the configured costing method; the current implementation targets weighted-average costing.
5. Negative stock is rejected unless an explicit company/item policy permits it.
6. Transfers preserve value: the source movement and destination movement form one atomic business operation.
7. Reversals create compensating movements; original movements are never edited or deleted.
8. Opening stock with unknown valuation remains quantity-only until a defensible source value is imported from Tally.
9. Production consumption, finished-goods receipt and scrap must be explicit movements with traceable production references.

## Business workflow rules

### Sales

Draft → confirmed → dispatched → invoiced/paid as applicable.

- Sales order confirmation may reserve stock but must not reduce physical stock.
- Dispatch reduces stock and creates the inventory valuation effect.
- Invoice creates the receivable and revenue/tax GL effect.
- Payment allocates against specific bills or remains explicitly on-account.

### Purchasing

Draft → approved/ordered → received → billed → paid as applicable.

- Purchase bill creation alone does not imply physical receipt.
- Receipt increases stock.
- Vendor bill creates payable/tax accounting.
- Payment allocates against vendor bills or remains explicitly on-account.

### Production

Planned → released → consuming → completed → finished-goods received.

- BOM quantities must have defined units.
- Component consumption must be explicit and valued.
- Scrap/wastage must be an explicit rule and movement, never an unexplained quantity difference.
- Finished goods require an explicit output quantity and valuation method.

## Mandatory accounting reports before Tally retirement

- Trial Balance
- General Ledger
- Profit & Loss
- Balance Sheet
- Cash/Bank ledger
- Accounts Receivable ageing
- Accounts Payable ageing
- Customer statement
- Supplier statement
- Day Book / voucher register
- Stock ledger
- Stock valuation
- Stock ageing where applicable
- GST outward/inward summaries and reconciliation
- Outstanding advances/on-account balances
- Financial-year opening/closing controls

Every report must be reproducible from immutable source transactions and support an as-of date where meaningful.

## Tally migration contract

TallyBridge remains the source of truth until the cutover is explicitly approved.

The migration layer must preserve, where present:

- master identity
- voucher identity
- voucher type and number
- transaction date
- debit/credit lines
- bill/reference identity
- due date
- opening balance
- against-reference allocations
- advances/on-account amounts
- GST components
- stock item identity
- godown/location
- quantity
- rate/value
- batch/serial identity where applicable
- cost centre/dimension

Missing source information must be reported as missing. It must never be invented.

## Security contract

- Financial mutations are server/database controlled.
- Client-side inserts/updates/deletes to posted accounting records are prohibited.
- RLS and database grants are the final enforcement layer, not UI permissions.
- Admin-only operations include period close/reopen, opening-balance correction, migration controls and accounting diagnostics.
- AI can read and explain ERP data but cannot silently post accounting or inventory transactions.
- Every privileged accounting/inventory mutation has an auditable actor, timestamp, source document and idempotency key where applicable.

## Production gate

The ERP is **not considered Tally-replacement ready** until all of the following are true:

- [ ] Canonical posting functions exist in the live database.
- [ ] All production screens call canonical posting functions rather than direct accounting/stock writes.
- [ ] Phase 1 accounting integration is compatible with the existing live schema and historical vouchers.
- [ ] Phase 2 bill-wise receivable/payable model is reconciled with existing bills, invoices and party/supplier balances.
- [ ] Inventory ledger is integrated without creating a second source of stock truth.
- [ ] Production consumption and finished-goods valuation rules are explicitly configured.
- [ ] Opening stock quantities have source-backed valuation or are explicitly classified as unvalued.
- [ ] GST posting uses explicit CGST/SGST/IGST/cess components.
- [ ] Tally migration has a repeatable reconciliation report with zero unexplained differences before cutover.
- [ ] Accounting and inventory concurrency/idempotency tests pass against the actual production-compatible schema.
- [ ] RLS/grants and direct-write denial are verified.
- [ ] A recoverable production backup point is verified before the first schema activation.
- [ ] Trial balance, receivables, payables and stock valuation reconcile immediately before and after activation.

## Reference architecture

The design follows the same core principles used by established ERP systems: operational documents generate balanced accounting entries, inventory movements maintain physical/value history, and accounting/inventory remain traceable to the source transaction. See Odoo's documented double-entry and perpetual/periodic inventory valuation model and ERPNext's source-document → GL/payment-ledger model for comparable reference architecture.
