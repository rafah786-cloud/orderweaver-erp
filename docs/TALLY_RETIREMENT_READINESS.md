# Tally Retirement Readiness — Current Status

## Implemented
- Failed Tally migration runs are terminal.
- Duplicate migration source keys and duplicate Alter IDs are rejected before staging.
- Tally Alter IDs are preserved from XML parsing through staging.
- Durable incremental-sync control-plane tables and RLS are implemented.
- Per-company/per-record-type Alter ID watermarks are implemented.
- Accepted sync batches and replayable sync rows are implemented.
- Watermark advancement is atomic with durable batch acceptance.
- Idempotent exact-batch retry is implemented.
- Server-side batch and row hashing is implemented.
- Admin-only sync control plane is implemented.
- Application + TallyBridge CI currently passes on the previous mainline changes.

## Still blocked
1. Exact TallyPrime extraction/filter definition for Alter ID greater than the stored watermark is not yet enabled. The current bridge remains read-only snapshot extraction.
2. Downstream application of accepted sync rows into canonical ERP accounting/inventory records is not yet enabled.
3. Bill-wise migration/reconciliation must be proven against live Tally data.
4. Voucher-level double-entry reconciliation must pass.
5. Stock quantity and value reconciliation must pass.
6. Production consumption/finished-goods valuation must pass.
7. Dry-run/rollback and backup-restore drill must pass.
8. Control-total sign-off must pass.

## Cutover rule

**Do not retire TallyPrime while any blocked item remains.**

The control plane is intentionally ahead of the extractor: it gives us a safe place to receive and order changes without pretending that the source extraction or accounting application is already complete.
