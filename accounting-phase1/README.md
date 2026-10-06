# Phase 1 Accounting Foundation

Status: implemented and validated against a disposable local PostgreSQL 17.9 database containing synthetic fixtures. It remains intentionally unapplied to the shared live database.

The SQL adds atomic posting, server-side balance checks, row-locked numbering, idempotency, lifecycle and reversal controls, immutable final entries, financial-year overlap/current-year rules, close/reopen audit events, and date-aware opening/movement/closing calculations.

The local database validation report is in `DATABASE_VALIDATION_REPORT.md`. Before production promotion, apply this file to a separately provisioned managed test database containing a safe schema/data copy, verify managed authentication and RLS behavior, reconcile all pre-existing vouchers, then pass the same SQL unchanged to the managed migration system.