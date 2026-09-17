# Phase 1 Database Validation Report

## Verdict

**PASS for isolated PostgreSQL database behavior.**

- Engine: PostgreSQL 17.9
- Isolation: disposable local cluster and database, Unix-socket only, synthetic fixtures only
- Production credentials/data/schema: not used or modified
- ERP screens and production workflows: unchanged
- Phase 2: not started
- Final automated result: 25 PASS, 0 FAIL

## Defects demonstrated and corrected

### 1. Financial-year resolution failed on PostgreSQL 17

- Initial test: post a balanced sales voucher in an open FY.
- Result: FAIL — `ERROR: function min(uuid) does not exist` from `resolve_financial_year(date)`.
- Affected function: `public.resolve_financial_year(date)`.
- Correction: count matching years first, then select the sole matching UUID without `min(uuid)`.
- Retest: PASS.

### 2. Concurrent duplicate source delivery returned intermittent errors

- Initial test: 10 concurrent calls with one `(source_table, source_id)` and different idempotency keys.
- Result: FAIL — one voucher was stored, but only 7 callers succeeded and 3 received unique-violation errors.
- Affected function: `public.create_gl_voucher_internal(...)`.
- Correction: on `unique_violation`, re-read by `(source_table, source_id)` after the existing idempotency-key lookup.
- Retest: PASS — 10/10 calls returned one voucher ID; one row stored; zero errors.

### 3. FY close/post race allowed a voucher in a newly closed year

- Initial test: overlap posting and closing transactions against the same FY.
- Result: FAIL — final state was `closed` with the racing voucher committed.
- Affected function: `public.create_gl_voucher_internal(...)` and its interaction with `public.close_financial_year(uuid)`.
- Correction: acquire a shared lock on the resolved FY row and check its locked status while holding that lock.
- Retest A, posting starts first: PASS — posting commits, then close waits and commits; the voucher is included before closure.
- Retest B, closing starts first: PASS — close commits, waiting post fails with `Financial year is closed`; zero voucher rows stored.

### 4. Lifecycle bypass leaked across the rest of a transaction

- Initial test: call a controlled lifecycle function, then directly update a final voucher in the same transaction.
- Result: FAIL — raw update succeeded because `app.accounting_lifecycle` remained `on`.
- Affected functions: posting, reversal, cancellation, close, and reopen functions using the lifecycle setting.
- Correction: remove unnecessary bypass activation and explicitly restore `off` immediately after each guarded update.
- Retest: PASS — direct update fails with `Final accounting records are immutable`.

## Final test matrix

| Test | Exact operation | Database result | Status |
|---|---|---|---|
| Voucher types | Posted balanced sales, purchase, receipt, payment, contra, journal, debit note, and credit note vouchers | All returned `posted` | PASS |
| Concurrent number allocation | 40 concurrent journal postings | 40 committed, 40 unique numbers, series advanced exactly 40 | PASS |
| Concurrent posting | Same 40-session workload | 40 complete vouchers stored; no partial vouchers | PASS |
| Debit/credit enforcement | Posted two lines with Dr 10 and Cr 9 | Rejected as unbalanced; no voucher stored | PASS |
| Partial-failure rollback | Allow number allocation and line inserts to begin, then fail balance validation | Voucher count 0; number-series value unchanged after rollback | PASS |
| Concurrent idempotent retry | 20 concurrent retries with one idempotency key | 20 successful responses, one returned ID, one voucher, series advanced once | PASS |
| Reversal | Reverse a posted credit note | Original `reversed`; linked reversal created; combined ledger effect zero | PASS |
| Cancellation | Cancel one draft and one posted debit note | Draft finalized without GL impact; posted voucher received a linked compensating reversal | PASS |
| Final-entry immutability | Raw update/delete of final voucher and raw update of its entries | All rejected with `Final accounting records are immutable` | PASS |
| Same-transaction immutability | Controlled reversal followed by raw voucher update before commit | Raw update rejected; transaction aborted | PASS |
| Sequential duplicate source | Submit same source/event ID twice | Same voucher returned; one stored row | PASS |
| Concurrent duplicate source | Submit same source/event ID from 10 sessions | 10 successes, one returned ID, one stored row, zero errors | PASS |
| Backdated open-period entry | Post on first day of earlier open FY | Posted and assigned to correct FY | PASS |
| Closed-period rejection | Close FY, then post into it | Rejected with `Financial year is closed`; no voucher stored | PASS |
| Concurrent close calls | Eight concurrent closes on one FY | All calls completed idempotently; one close audit event | PASS |
| Concurrent reopen calls | Eight concurrent reopens on one FY | All calls completed idempotently; one reopen audit event | PASS |
| Close/post race, post first | Hold FY shared lock during posting while close begins | Post completes first; close waits and then closes | PASS |
| Close/post race, close first | Hold FY update lock while post begins | Close completes; post is rejected; zero late vouchers | PASS |
| Sales atomic posting | Insert fixture invoice: subtotal 1,000, tax 180, total 1,180 | Four GL lines; Dr 1,180 = Cr 1,180 | PASS |
| Purchase atomic posting | Insert fixture purchase bill for 590 | Two GL lines; Dr 590 = Cr 590 | PASS |
| Sales trigger rollback | Insert invoice with subtotal 1,000, tax 180, total 1,179 | Balance validation fails; source invoice and GL voucher both roll back | PASS |
| Control totals | Reconcile all final vouchers | Zero unbalanced vouchers; global Dr 4,025 = Cr 4,025 | PASS |
| FY-aware balance | Query cash for 2026-04-01 through 2027-03-31 | Opening 1,005; Dr 1,970; Cr 280; closing 2,695 | PASS |

## Changed schema/functions

No live schema was changed. The isolated migration definition changed only in:

- `public.resolve_financial_year(date)` — PostgreSQL-compatible UUID resolution.
- `public.create_gl_voucher_internal(...)` — FY shared lock and concurrent source-ID recovery.
- Lifecycle callers — bypass setting restored immediately after guarded updates.

## Remaining risks and blockers

- **PARTIAL — managed-environment parity:** local PostgreSQL behavior passed, but the migration has not been applied to a separately provisioned managed test project. Managed authentication claims, RLS, API grants, connection-pool behavior, and a production-like schema copy remain unverified.
- **BLOCKED — production promotion:** production and preview share one database, so this migration must not be applied there until a separate managed test project exists and its reconciliation passes.
- **Migration risk:** existing overlapping/current financial years, vouchers outside configured FY ranges, duplicate source IDs/idempotency keys, inactive ledgers, or legacy unbalanced entries can stop migration or close operations. Run preflight queries on a safe copied dataset.
- **Migration risk:** direct authenticated writes to vouchers, voucher entries, and numbering are revoked. Every existing integration must be exercised against the approved functions in the managed test project before promotion.
- **Migration risk:** sales/purchase posting still depends on configured ledger names and valid party/supplier ledger mappings. Validate those masters in the copied dataset.
- **Out of scope:** no Phase 2 bill-wise, stock-ledger, GST expansion, migration staging, or TallyBridge work was performed.