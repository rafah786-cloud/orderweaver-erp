# Phase 2 Bill-wise Accounting

Status: implemented and database-tested as an isolated, unapplied migration. It depends on the Phase 1 accounting foundation and must not be applied to the shared live database.

The migration adds canonical bills and allocations, atomic invoice/purchase bill creation, opening-bill and receipt/payment settlement operations, concurrency-safe allocation checks, reversal allocations, and as-of outstanding/ageing functions. Existing `current_balance`, `paid_amount`, and legacy party/supplier ledger rows remain compatibility data only; no ERP screen has been switched.

## Isolated database validation

`tests/run_phase2_suite.py` is fail-closed and requires `MANAGED_TEST_DATABASE_URL` with TLS, `EXPECTED_TEST_PROJECT_REF`, `EXPECTED_TEST_DATABASE`, and `ALLOW_PHASE2_DATABASE_TESTS=managed-test-only`. It rejects the shared live project and displays the target identity after a read-only probe before running any test SQL. Do not run it until a separate managed TEST project is provisioned and the Phase 1 and Phase 2 migrations are explicitly applied there. Earlier, against a disposable PostgreSQL 17 instance with Phase 1 and synthetic fixtures installed, 18 checks passed with zero failures:

- customer and supplier opening bills
- atomic invoice and purchase-bill linkage
- partial and full settlement
- idempotent settlement retry
- over-allocation and wrong-party-type rejection
- one payment allocated across multiple bills
- as-of outstanding and ageing totals
- concurrent settlement locking
- compensating allocations after voucher reversal
- source-voucher reversal cancellation with as-of report handling
- retry-safe opening bills without external references

Managed authentication, RLS/API grants, connection pooling, and copied-data reconciliation remain blocked until a separate managed test project is connected. This migration remains unapplied and no production screen or workflow uses it.
