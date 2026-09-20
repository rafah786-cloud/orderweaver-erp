# Phase 2 Bill-wise Accounting

Status: initiated as an isolated, unapplied migration. It depends on the Phase 1 accounting foundation and must not be applied to the shared live database.

The migration adds canonical bills and allocations, atomic opening-bill and receipt/payment settlement operations, concurrency-safe allocation checks, reversal allocations, and as-of outstanding/ageing functions. Existing `current_balance`, `paid_amount`, and legacy party/supplier ledger rows remain compatibility data only; no ERP screen has been switched.
