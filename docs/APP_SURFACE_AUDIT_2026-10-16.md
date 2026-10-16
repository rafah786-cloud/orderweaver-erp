# Mattress Maestro — Full App Surface Audit

**Audit date:** 2026-10-16  
**Repository:** `rafah786-cloud/orderweaver-erp`  
**Purpose:** Track the full web-app audit separately from passing CI. This is a source/repository audit, not a claim of completed manual browser testing or live-production validation.

## Audit method and evidence

- Enumerated the current `main` Git tree and all TanStack route files.
- Read the role-policy registry, app layout/guard, sidebar/navigation implementation, package scripts, CI workflow, global ERP capability-gap audit and production-readiness contract.
- Checked the latest merged mobile-layout fix and its post-merge GitHub Actions run.
- Existing automated gates: ESLint, Vitest, production build, TallyBridge build/tests, isolated PostgreSQL tests for enterprise-workbench RLS and bank-reconciliation RPC.
- Route authorization is fail-closed: unknown private paths have no policy; nested paths inherit a registered top-level policy. The enterprise workbench is deliberately omitted from ordinary navigation and restricted to administrators.
- Added a regression test enumerating every private route file and confirming that each has a registered route policy. PR #91 was merged after all four CI checks passed.
- Added a role-specific personal inbox policy, user-scoped unread count, and desktop/mobile unread badge. PR #92 was merged after all four CI checks passed.
- Post-merge main CI for commit `c530627f8e11612522bccaf3b7fac3d42b38487e` passed: app (lint/tests/build), TallyBridge, enterprise-workbench RLS and bank-reconciliation RPC.

## Module inventory and status

Status terms:
- **Present** means a route/domain exists in source; it does not mean every control has been manually exercised.
- **CI** means automated checks pass for the current main commit.
- **Not verified** means live database, external service, device, or production behaviour has not been demonstrated.

| Area | Present in source | Audit focus / remaining verification |
|---|---|---|
| Workspace, dashboard, company switcher, auth | Yes | Verify each role/company in a live session; auth/RLS and company switching need environment-backed tests. |
| Parties, sales orders, invoices, BOQ | Yes | End-to-end order-to-dispatch-to-invoice and return/credit-note behaviour; permissions and print handoff. |
| Purchases, vendors, purchase orders | Yes | End-to-end approved PO → receipt → inspection → bill → payment; partial receipt and cancellation paths. |
| Inventory, movements, journals, valuation, reorder, godowns | Yes | Reconcile every movement and valuation to canonical posting functions; transfer/reversal, unit conversions and concurrency. |
| Production, MRP, capacity, operations | Yes | MRP multi-level explosion exists, but stock netting is intentionally blocked by the production-readiness contract. No claim of live availability/shortage or finite scheduling. |
| Accounting, ledger, vouchers, trial balance, P&L, balance sheet, day book | Yes | Reconcile against Tally and actual database; verify period-close, reversal, idempotency, bill-wise allocations and concurrent posting. |
| Banking, cheques, payment advice, reconciliation, currencies | Yes | Bank reconciliation RPC has isolated PostgreSQL tests; live bank statement imports, real accounts, print and end-to-end reconciliation not verified. |
| GST, returns, e-invoices, HSN | Yes | Live provider credentials and official filing flows not verified; tax amounts must reconcile to explicit source tax components. |
| AI, search, insights, proposals, documents, quotations | Yes | Validate tenant/company-scoped retrieval, freshness, citations, error handling, action approval and model/provider failures against real data. AI must not silently post. |
| Employees, attendance, payslips | Yes | Verify employee self-access vs HR/admin scope, payroll calculations, statutory rules, approval and export flows in a test company. |
| Approvals, communications, inbox, templates, WhatsApp | Yes | Provider credentials, delivery callbacks, retries, opt-outs, unread counts and notification device behaviour not verified end-to-end. |
| Tally import, local Tally accounts, TallyBridge | Yes | Code and bridge CI exist; full voucher/master import, company mapping, bill-wise and stock reconciliation, idempotent rerun and cutover are not complete. |
| Print hub, invoice/party/supplier/purchase print, print bridge | Yes | Unit tests/CI exist for bridge; physical printer/browser/OS handoff, duplicate-print and acknowledgement flow need real-device tests. |
| Vendor portal | Yes | Verify vendor isolation, invitation/onboarding, purchase-order access and no cross-company disclosure with real auth/RLS tests. |
| Settings, role setup, enterprise workbench | Yes | Admin-only workbench and RLS gates exist; live migration state and all destructive/edge-case actions require test-environment validation. |
| Responsive/mobile navigation | Yes | Mobile layout PR #89 merged; post-merge CI succeeded. Physical iOS/Android viewport, keyboard, touch, PWA and printer-specific tests remain external-device gates. |
| Website/public/auth routes | Yes | Login, reset, signup, pending, OAuth consent and not-found/error states require browser-driven smoke tests and provider callback validation. |

## Confirmed guardrails

1. Financial postings must be balanced, idempotent and server/database controlled.
2. Inventory movement ledger remains the stock source of truth; do not patch stock balances directly.
3. MRP availability/netting remains blocked until reversal-aware dated balances, reservation lifecycle, inbound supply, units/mappings and double-counting tests are established.
4. Tally remains the source of truth until import/reconciliation and cutover are explicitly approved.
5. Staged migrations are not equivalent to migrations applied and verified against the live database.
6. A passing lint/test/build pipeline does not prove every interactive control works in a real browser or with a real external integration.

## Remaining acceptance gates for a true completion claim

- [ ] Run current-main CI and retain the final successful run for the exact deployed/reviewed SHA.
- [ ] Execute route smoke tests for every top-level and nested route under each applicable role.
- [ ] Exercise every create/edit/delete/approve/post/reverse/print/export control in an isolated test tenant; verify loading, empty, error, retry and success states.
- [ ] Run database integration tests for all staged migrations on a recoverable copy using the actual schema and representative historical rows.
- [ ] Verify company isolation and direct-write denial for every privileged module, not only the workbench and bank reconciliation.
- [ ] Verify cross-module accounting/inventory effects, idempotent retries, reversals and audit events.
- [ ] Complete Tally master/voucher import validation, bill-wise and stock reconciliation, duplicate/rerun tests, then prove the result inside ERP staging.
- [ ] Test external providers and physical devices with non-production credentials/test data.
- [ ] Only after the above, approve deployment and repeat post-deployment smoke tests.

## Result

This source audit establishes a route/module inventory and explicit acceptance gates. It does **not** assert that all UI controls or live integrations are already tested. The outstanding checklist must be closed with evidence before the web app can be labelled fully audited and complete.
