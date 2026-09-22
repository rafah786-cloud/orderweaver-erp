# Phase 2 Bill-wise Accounting

Status: implemented and database-tested as an isolated, unapplied migration. It depends on the Phase 1 accounting foundation and must not be applied to the shared live database.

The migration adds canonical bills and allocations, atomic invoice/purchase bill creation, opening-bill and receipt/payment settlement operations, concurrency-safe allocation checks, reversal allocations, and as-of outstanding/ageing functions. Existing `current_balance`, `paid_amount`, and legacy party/supplier ledger rows remain compatibility data only; no ERP screen has been switched.

## Isolated database validation

`tests/run_phase2_suite.py` is fail-closed and requires an explicitly isolated database URL. Against PostgreSQL 17 with Phase 1 and synthetic fixtures installed, 14 checks passed with zero failures:

- customer and supplier opening bills
- atomic invoice and purchase-bill linkage
- partial and full settlement
- idempotent settlement retry
- over-allocation and wrong-party-type rejection
- one payment allocated across multiple bills
- as-of outstanding and ageing totals
- concurrent settlement locking
- compensating allocations after voucher reversal

Managed authentication, RLS/API grants, connection pooling, and copied-data reconciliation remain blocked until a separate managed test project is connected. This migration remains unapplied and no production screen or workflow uses it.
