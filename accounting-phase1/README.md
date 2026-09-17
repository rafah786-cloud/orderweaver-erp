# Phase 1 Accounting Foundation

Status: implemented for an isolated database, intentionally not applied to the shared live database.

The SQL adds atomic posting, server-side balance checks, row-locked numbering, idempotency, lifecycle and reversal controls, immutable final entries, financial-year overlap/current-year rules, close/reopen audit events, and date-aware opening/movement/closing calculations.

Before promotion, apply this file to a separately provisioned test database containing a copy of the current schema, run the database integration matrix, reconcile all pre-existing vouchers, then pass the same SQL unchanged to the managed migration system.