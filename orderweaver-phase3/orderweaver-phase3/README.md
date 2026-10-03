# Phase 3 Inventory Ledger

Status: implemented as an isolated schema. Not applied to the shared live database. Not wired to ERP screens.

`inventory_ledger` is the canonical stock book for this phase:

- Quantity and value come only from posted movements. There is no writable current-stock column.
- Receipts, issues, godown transfers, and production journals post atomically.
- Sales-order style reservations reduce available quantity and do not change value.
- Issues and production consumption use weighted average. A zero-value outward movement is rejected.
- Negative stock is rejected unless the item explicitly allows it, with a reason stored on the issue document.
- Repeating an idempotency key returns the original document.
- Reversal posts the opposite movements and keeps the source document.

Weighted average is the only valuation method in this phase. FIFO, LIFO, and standard-cost variance stay for a later phase.

Apply `001_inventory_ledger.sql` only on a disposable database. Do not run it against the Lovable/Supabase production project.
