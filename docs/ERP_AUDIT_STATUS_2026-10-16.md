# Mattress Maestro ERP — Capability & Production Audit Status
Date: 2026-10-16  
Branch baseline: `main` @ 8b31ae715a03b32f87a9e22669d1eda303b58e5a  
Auditor: independent review against SAP S/4HANA, Dynamics 365 SCM, NetSuite, Odoo 19, ERPNext patterns and the project's own production-readiness / Tally-retirement contracts.

## 1. Scope of this pass

- Navigation / role model / route inventory
- Accounting, inventory, sales, production, MRP, quality, maintenance, PLM, banking, GST, AI, communications
- Database contracts (RLS, posting, immutability, netting blockers)
- Existing automated tests (Vitest unit + Python RLS/security)
- CI workflow coverage
- Residual gaps vs global ERP leaders

This is a **code and contract audit**. Live end-to-end UI verification of every page requires authenticated access to the production Supabase project and was not available in this pass.

## 2. Current strengths (confirmed in source)

| Area | Evidence |
|------|----------|
| Double-entry & voucher lifecycle | Phase 1–3 SQL, `accounting-foundation`, sales/purchase chain tests |
| Inventory ledger authority | `stock_movements` as source of truth; direct stock overwrite prohibited |
| Company isolation & RLS | Multiple migrations + `enterprise_workbench_admin_rls`, `selected_table_rls`, sales-order approved-read tests |
| Production QC gate | Production page + DB migration `require_final_qc_before_release` |
| MRP honesty | Read-only multi-level explosion; **netting explicitly blocked** with documented contract gap (`MRP_NETTING_BLOCKER`) |
| Quality / CAPA / Maintenance guards | Client guards + DB workflow integrity migrations |
| PLM / BOM revisions | Effective-dated revisions, ECO tables, multi-level BOM components |
| Enterprise Workbench | Generic admin CRUD for work centres, MPS, routings, inspections, NCs, CAPA, assets, PM plans, RFQs, etc., with status governance |
| Banking / bank reconciliation | Hardened RPC + live schema fix + CI job |
| AI retrieval-first | RLS-scoped, fail-closed generation on retrieval failure |
| Tally control plane | Staging, integrity checks, incremental sync docs; imports fail closed |

## 3. Route / module inventory (high level)

**Core operational**  
Dashboard, Parties, Sales Orders, Invoices, Purchases, Production, Inventory (items, godowns, movements, journals, reorder, summary, valuation), BOQ, MRP, Capacity, Operations, Attendance, Employees, Payslips.

**Finance & tax**  
Accounting (ledgers, vouchers, trial balance, P&L, balance sheet, day book, periods, audit log, consolidated), Banking (accounts, cheques, reconcile, currencies, payment advice), GST (HSN, e-invoices, returns).

**Enterprise domains (Workbench)**  
Manufacturing planning, Quality, Maintenance & Assets, PLM/Engineering, Strategic Procurement, Warehouse extensions, Fixed assets / budgets scaffolding, HR extensions, Logistics, Projects, Workflow, AI governance tables.

**Integrations & platform**  
Tally import / local Tally accounts, Vendor portal, Communications / WhatsApp, AI (ask, brief, documents, insights, proposals, quotations, search), Approvals, Settings, Print routes, Biometric public API.

Roles referenced: admin, sales, production, HR, accountant, customer, employee, vendor (plus approved-account gates).

## 4. Automated test baseline

### Vitest (`bun run test`)
Located primarily under `src/lib/**/*.test.ts`, including:

- Accounting foundation, sales chain, purchase chain
- Accounting preflight security
- Bank reconciliation (unit + live-schema)
- Banking admin security
- Accountant invoice read policy
- AI assistant / audit / documents / forecast
- MRP-related pure functions (explosion, availability, BOM source)
- Enterprise workbench / CAPA / maintenance guards (where present)

### Python security / RLS (CI jobs)
- `enterprise_workbench_admin_rls.py`
- `bank_reconciliation_rpc.py`
- Additional scripts present but **not yet all wired into CI**:  
  `sales_orders_approved_read.py`, `selected_table_rls.py`, `test_enterprise_domain_permissions.py`

### Accounting SQL suites
- `accounting-phase1/tests`, `accounting-phase2/tests` (require configured Postgres target)

**CI gap addressed in this branch:** expand branch triggers and add jobs for the remaining security scripts so regressions are caught on every PR.

## 5. Residual P0 / P1 gaps (still open)

These match the 2026-10-08 gap audit and remain only partially closed by later migrations.

### P0 — do not claim readiness until closed

1. **MRP netting & supply**  
   Gross requirements only. No verified as-of stock, dated reservation lifecycle, or confirmed open supply. Correctly fails closed today — **do not invent availability**.

2. **Shop-floor execution depth**  
   Operations table exists; operator job cards, finite capacity scheduling, OEE, variance accounting, subcontracting flows are incomplete.

3. **Quality end-to-end**  
   Plans / inspections / NC / CAPA present with guards. Full control plans, supplier quality scorecards, quarantine stock linkage, and customer-return quality still thin.

4. **Warehouse execution**  
   Ledger strong; bin/zone, put-away/pick strategies, cycle-count approval, barcode workflows incomplete.

5. **Procurement strategic cycle**  
   RFQ tables in workbench; full quotation comparison → ASN → three-way match → scorecards not fully operationalized in primary purchase screens.

6. **Finance expansion**  
   Fixed-asset register / depreciation / budgets / formal month-end close checklist incomplete relative to Tally-replacement bar.

7. **Tally retirement gate**  
   Production-readiness checklist items still open (canonical posting on all screens, reconciliation zero differences, opening stock valuation classification, etc.).

### P1

- Sales CRM pipeline, ATP/order promising, RMA/returns, POD
- Logistics / multi-stop dispatch
- HR leave, recruitment, performance, labour costing into production
- Project costing for contract mattress supply
- AI 2.0 (evidence drill-down, proactive alerts, governed draft actions)
- Platform: configurable approval matrix, universal search, attachment governance, DR verification, archival

## 6. Non-negotiable implementation rules (unchanged)

Every new or changed module must:

1. Respect company isolation and RLS  
2. Use server/database-controlled mutations for financial and stock effects  
3. Preserve auditability and immutability of posted documents  
4. Integrate with canonical accounting / inventory effects  
5. Support idempotency where retries can occur  
6. Never invent historical or missing source data  
7. Ship automated tests  
8. Keep explicit workflow states  
9. Remain consumable by the AI retrieval layer

## 7. Recommended execution sequence (decided priority)

1. **CI & security coverage** (this branch) — wire remaining Python RLS tests; broaden branch triggers.  
2. **Production-readiness checklist closure** — canonical posting paths, reconciliation reports, opening-stock valuation flags.  
3. **MRP recovery design only** — dated reservation + as-of ledger contract + isolated tests *before* any netting UI.  
4. **Quality / Maintenance / PLM workflow completeness** on primary screens (not only workbench).  
5. **Warehouse bins + cycle count** foundations.  
6. **Fixed assets + budgets**.  
7. **Procurement RFQ → PO operational path**.  
8. CRM / logistics / HR / projects / AI 2.0.

## 8. What this audit did *not* claim

- That every UI page was clicked in a live authenticated session.  
- That the production Supabase schema is 100% in sync with every migration file (requires your environment).  
- That Tally retirement is complete (explicitly not, per `ERP_PRODUCTION_READINESS.md`).

## 9. Next concrete commits expected on this branch / follow-ups

- CI expansion (done in companion commit).  
- Any pure-function / guard unit-test gaps found while inspecting workbench and MRP.  
- Documentation of residual blockers remains the single source of truth until each P0 item is closed with tests.
