# Tally Incremental Sync Control Plane

Status: **implemented as durable backend infrastructure; source extraction remains gated until the exact Tally collection/filter contract is verified against the installed Tally release.**

## What is now implemented

- One registered Tally source per ERP company + connector ID.
- A separate Alter ID watermark for each source + record type.
- Immutable accepted sync batches with payload hashes.
- Individual replayable sync rows.
- Processing/dead-letter state for downstream application.
- Company-scoped RLS.
- Atomic acceptance function that:
  1. locks the source/watermark,
  2. checks the caller/company,
  3. rejects a stale watermark,
  4. validates row Alter IDs,
  5. rejects duplicate Alter IDs,
  6. stores the batch and rows,
  7. advances the watermark only after durable row storage.
- Server-side deterministic hashing and validation.
- Regression tests for watermark ordering, duplicate detection and deterministic hashing.

## Tally basis

TallyPrime documents that an Alteration ID (AID) is generated when a voucher is altered or re-accepted and that synchronization uses the previous AID to obtain newer changes. Tally also documents that snapshot import is managed from the latest Alter ID to avoid duplication.

This ERP therefore treats the Alter ID as a **source change-order cursor**, not as an accounting posting key.

## Important safety boundary

The current TallyBridge still performs read-only collection/data exports. We have **not** invented an XML filter or collection definition that claims to mean "AlterID > watermark".

Before enabling automatic incremental extraction, the exact collection/filter mechanism must be verified against the installed TallyPrime release and tested with:
- new voucher;
- altered voucher;
- re-accepted voucher;
- back-dated voucher;
- cancelled voucher;
- master alteration;
- company restart;
- connector restart;
- repeated identical batch.

Only after those tests pass should the bridge call the new acceptance endpoint.

## Authority model

During parallel run, Tally remains the accounting authority. Mattress Maestro must not perform uncontrolled bi-directional accounting writes. Incremental sync is therefore an evidence/replication pipeline first; canonical accounting application is a separate, reviewed step.

## Cutover gate

Tally retirement remains blocked until:
- incremental extraction is verified end-to-end;
- bill-wise allocations are reconciled;
- voucher double-entry totals reconcile;
- stock quantity/value reconciles;
- production consumption/output is linked and valued;
- dry-run/rollback is tested;
- control totals are signed off;
- backup/restore has been drilled.
