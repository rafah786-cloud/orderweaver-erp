# Phase 2 Bill-wise Accounting

Status: implemented and database-tested as an isolated, unapplied migration. It depends on the Phase 1 accounting foundation and must not be applied to the shared live database.

The migration adds canonical bills and allocations, atomic invoice/purchase bill creation, opening-bill and receipt/payment settlement operations, concurrency-safe allocation checks, reversal allocations, and as-of outstanding/ageing functions. Existing `current_balance`, `paid_amount`, and legacy party/supplier ledger rows remain compatibility data only; no ERP screen has been switched.

The canonical sales chain is Phase 1 atomic GL posting followed by the Phase 2 party-ledger bill and bill allocation. Taxed invoice posting is intentionally fail-closed because the current invoice record stores only aggregate tax and cannot prove the CGST/SGST/IGST split. The prepared Phase 3 shadow receipt/invoice functions are not part of this canonical path.

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

`tests/run_local_chain.py` additionally creates a disposable local PostgreSQL cluster, strips inherited managed-database credentials, installs only synthetic fixtures plus Phase 1 and Phase 2, and validates 19 canonical-chain controls. It covers tax and closed-year rollback, invoice and purchase subledgers, balanced GL linkage, receivable/payable bills, receipt/payment allocation, idempotency, over-allocation, immutability, reversal compensation, as-of behavior, and source reversal. It never connects to or modifies the shared production database.
