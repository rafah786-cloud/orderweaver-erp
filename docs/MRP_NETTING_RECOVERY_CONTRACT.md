# MRP Netting Recovery Contract
Date: 2026-10-16
Status: **Design only — netting remains blocked in production code**

## Purpose

Define the minimum verified contracts required before Mattress Maestro may
replace the current master-only availability gate (`availableQuantity = null`)
with real material netting. This document does **not** authorise migrations,
RPCs, or UI changes that read live stock for planning.

## Why netting is blocked today

Documented in `docs/ERP_PRODUCTION_READINESS.md` (2026-10-14):

| Dependency | Current gap |
|------------|-------------|
| As-of stock balance | `stock_on_hand` has no as-of argument; compensations via `reverses_posting_id` are not reconstructed historically |
| Reservation lifecycle | `stock_reservations` lacks effective / released / consumed timestamps; admin-only SELECT |
| Open supply | Purchase receipts and planned orders lack a confirmed remaining-supply-as-of contract |
| Mapping scope | Raw↔stock unit/godown completeness and double-count rules untested |
| Role/company isolation | Planning snapshot must not rely on invoker RLS alone |

Until every row below is closed with **isolated automated tests**, the MRP page
must continue to call `unnettedMaterialBalances` and surface `MRP_NETTING_BLOCKER`.

## Required contracts before enablement

### 1. As-of stock ledger function

```
stock_on_hand_as_of(company_id uuid, item_id uuid, as_of timestamptz, godown_id uuid default null)
  → quantity numeric, value numeric (optional)
```

Must:

- Accept explicit `company_id` and `as_of` (not only invoker RLS)
- Include all movements with `movement_date <= as_of` (or posting time policy — pick one and test)
- Net original + compensating rows (`reverses_posting_id`) so reversals after as-of do not erase earlier history incorrectly
- Reject or isolate unknown sign conventions via integration fixtures
- Be covered by tests for: empty ledger, receipt, issue, transfer pair, reverse after as-of, reverse before as-of, multi-godown

### 2. Dated reservation lifecycle

`stock_reservations` (or successor) must expose at least:

- `qty`, `status`
- `effective_at`, `released_at`, `consumed_at` (nullable timestamps)
- company + item + optional document reference

Open reservation as-of `T` = rows where `effective_at <= T` and (`released_at` is null or `> T`) and (`consumed_at` is null or `> T`) and status in open set.

SELECT must be available to production/accountant roles under company scope (not admin-only), or planning must use a SECURITY DEFINER RPC that still enforces company membership.

Tests: open yesterday / consumed today, released before as-of, partial consume, cross-company denial.

### 3. Confirmed open supply

Nettable inbound supply requires a single authoritative view, e.g.:

```
open_supply_as_of(company_id, item_id, as_of) → remaining_qty, due_date, source_type, source_id
```

Sources may include firm planned purchase orders and unreceived PO lines, but only when:

- Commitment is explicit (ordered / firm, not draft)
- Cancellations and partial receipts reduce remaining quantity
- Due dates are confirmed, not speculative expected dispatch alone

Tests: partial receipt, cancel after firm, draft excluded, company isolation.

### 4. Demand attribution rules

Gross requirements already explode from production demand. Netting must **not**:

- Double-count reservations already tied to the same production demand
- Subtract issues already posted for that demand from both stock and demand
- Mix units without an explicit conversion table covered by tests

### 5. Enablement gate (all must pass)

- [ ] Migrations applied only after a verified restorable backup point
- [ ] Isolated Postgres tests for contracts 1–4 (companies, roles, cutoffs, reversals, partials)
- [ ] Vitest pure functions continue to fail closed when balances are null
- [ ] MRP route still documents data readiness; shortage only when balance is verified finite and ≥ 0
- [ ] No use of `raw_materials.current_stock` as planning truth
- [ ] Security review: RPC grants, RLS, direct-write denial unchanged for posted stock

## Explicit non-goals of the recovery phase

- Automatic purchase-order or production-order creation
- Finite capacity / lead-time scheduling
- Silent zeroing of unknown availability
- Client-side stock writes

## Ownership

Implementation of the SQL contracts is a separate migration track. Until the
enablement gate is fully checked, application code must retain the audited
fail-closed path in `src/lib/mrp-availability.ts` and `src/routes/_app.mrp.tsx`.
