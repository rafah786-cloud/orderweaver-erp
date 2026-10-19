# Repository Audit — Blueprint Alignment

> **LIVE-DATABASE STATUS: UNVERIFIED.** The current work is source-only. Do not treat any historical live-database statement elsewhere in this document or older audit artifacts as currently verified until the correct Supabase project is authorized and its catalog/migration ledger is read back.

**Audit date:** 2026-10-19  
**Repository:** `rafah786-cloud/orderweaver-erp`  
**Audited baseline:** `main` merge commit `a9c0ea39932ce22e3384b6e86046f7bb9b557370` (PR #124)  
**Scope:** source/tree/config/migration/test inventory plus the owner's 69-page blueprint. This is a source-level audit, not a production security certification. No application code or database was changed by this audit.

## Executive summary

The repository is an existing, substantial Mattress Maestro ERP—not a blank project. It is a React 19 + TypeScript application using Vite and TanStack Start/Router, Supabase, a sizeable route set, a long migration history, tests, and dedicated integration folders. It already contains sales/invoices, accounting, inventory, purchases, production/MRP, HR/attendance, quality, fleet, GST, communications/WhatsApp, marketing, Smart SleepTec, AI and Tally import work. The appropriate approach is incremental gap closure, not a rewrite.

The blueprint is materially broader and more systematic than the current implementation. The main architectural gap is turning existing screens and point features into a consistent company-scoped operating system with complete domain coverage, universal RLS/audit, transactional database rules, event-driven workflows, four-language/offline UX, and one governed agent runner with evaluations/approval/undo.

**Important evidence limitation:** the connected Supabase tooling returned an account-link error ("link_id must identify an eligible linked account"). I could not inspect the live database or verify which project is actually deployed. The repository's `supabase/config.toml` names project ID `ysaocrumxikgywdotkne`; that alone does not prove it is the live ERP database. No live schema queries or database writes were performed.

## 1. Repository and stack

- Baseline tree: 666 entries, including `src/`, `supabase/migrations/`, `drizzle/migrations/`, `tally-bridge/`, `biometric-sync/`, `accounting-phase1/2/3/`, `manufacturing-phase1/`, `security-tests/`, `.github/workflows/`, and `docs/`.
- Application: React 19, TypeScript, Vite 7, TanStack Start/Router, TanStack Query, Supabase JS, Tailwind 4, Radix/shadcn-style components, React Hook Form/Zod, Recharts; Bun lockfile present. Package scripts include `dev`, `build`, `build:dev`, `preview`, `lint`, `test`, `format`.
- Routes: extensive `src/routes/_app.*` route tree includes accounting, AI, approvals, attendance, banking/reconciliation, dashboard, employees, enterprise workbench, fleet, GST, inventory, invoices, local Tally accounts/import, maintenance, marketing, MRP, operations, parties, payslips, production, purchases, quality, sales orders, settings, shipments, shop floor, Smart SleepTec, vendor portal, website enquiries and communications. Public ecommerce routes also exist.
- Database change sources: many timestamped Supabase migrations through 2026-10-18, separate Drizzle migrations and schema files, plus staged accounting/manufacturing SQL. This split requires an authoritative migration policy and drift checks.
- CI: `.github/workflows/erp-ci.yml`, `production-smoke.yml`, and a one-time formatting workflow. Tests cover access/permissions, accounting, bank reconciliation, AI, company context, inventory, migration integrity, MRP/BOM, notifications, production/QC, Tally import/staging/sync, marketing, shipping, PWA and other domains.
- Environment names observed in the tracked `.env` (values intentionally not read out): `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`. The fact that `.env` exists in the repository is itself a risk; only publishable/client values should ever be there, but values need a separate secret-safe review and rotation decision if any credential was committed. No values are included in this audit.
- `drizzle/schema.ts` is intentionally blank/auto-generated; actual schema is represented by Supabase SQL migrations and generated Supabase types. Avoid treating the empty Drizzle schema as the database source of truth.

## 2. What exists and appears implemented in source

These are source-level findings; runtime correctness has not been independently established in this audit.

- Auth and app access decisions; role-to-route visibility policy; company context and company-switching code; approval routes and company-scoped access hardening migrations.
- Core transactional screens for parties, sales orders, invoices, purchases, inventory/godowns/journals/movements/valuation, production, MRP, BOQ/capacity, shop floor, quality, maintenance, shipments/fleet, employees/attendance/payslips, GST, banking/reconciliation, vendor, marketing and website enquiry.
- Accounting foundation and voucher/ledger reports, controlled posting functions, bank reconciliation and inventory posting/hardening migrations.
- Tally import pipeline utilities and routes, local read-only Tally account bridge, XML normalization/streaming, staging/preflight/reconciliation/incremental sync control-plane files.
- AI assistant/retrieval, document extraction, insights/briefs/proposals/quotations/search, agent-router, AI audit, forecasting and governance migration foundations.
- Integration foundations for biometric sync, Tally, WhatsApp/communications, and Velocity shipping.
- Existing documentation: AI architecture, cutover runbook, production readiness, founder virtual GM plan, global capability gap audit, security audit register/coverage, Tally staging/sync/retirement docs, and ecommerce docs.

## 3. Exists but differs from the blueprint / needs verification

- **Framework/layout:** current app is a single TanStack Start application with route-based workspaces, not the blueprint's proposed multi-app monorepo layout. Do not restructure just to match the example tree; reuse current patterns unless a demonstrated requirement needs separation.
- **Design system/i18n/offline:** mobile CSS/PWA tests exist, but the audit has not found proof that every screen is mobile-first, all text is translated into en/ml/hi/ta, and offline writes use a durable sync queue.
- **Domain completeness:** existing pages do not prove full underlying workflows. E.g. an MRP screen does not itself prove dated supply netting/finite capacity; a marketing screen does not prove campaign ROI; a machine screen does not prove telemetry ingestion and predictive maintenance.
- **Database model:** blueprint calls for consistent `company_id`, relevant `branch_id`, audit columns, soft-delete/status history, indexes and RLS for every business table. The existing migrations are numerous and incremental; full table-by-table compliance needs catalog-based verification once Supabase access is fixed.
- **Authorization:** client route roles exist, but route filtering is not the security boundary. Every table, RPC, storage bucket, realtime channel and server function still needs inventory and adversarial tests.
- **Business rules:** there are existing transactional functions and hardening, but the report's canonical examples (credit check/hold, reserve stock, BOM explosion, sole stock-ledger writer, confirm-order event publication) need a systematic function-to-screen/agent coverage map.
- **AI platform:** assistant, retrieval and agent-router foundations exist. The repository does not yet demonstrate all Section 13 agents running through a single fully governed runner with database prompt versions, allow-listed typed tools, autonomy limits, budgets, approval/undo, run viewer and per-agent evaluations.
- **Integrations:** some bridges exist, but live credentials and full retry/health/reconciliation contracts are not verified. Keep external actions mocked/sandboxed.
- **Tally:** significant import/staging work exists, but a full, reliable four-company historical migration is not proven. Native Tally backup files need compatible Tally restoration/export; archive extraction alone is not accounting import.
- **Blueprint copy:** `docs/blueprint.md` created by this audit branch is a structured index/summary, not a verbatim 69-page transcription. This limitation is called out in the file. The full Markdown specification is available in `docs/blueprint-full.md`; the PDF is not a repository deliverable.

## 4. Missing or not yet evidenced

- Verified inventory of every live database table, column, RLS state/policy, function grants, storage bucket/policies, realtime publication and deployed migration version.
- Definitive route → role → permission → operation → table/RPC → RLS-policy matrix.
- Table-by-table audit trigger/soft-delete/status-history coverage and evidence that every write captures actor, timestamp and before/after state.
- One reusable shared set of DataTable, EntityDetail, ApprovalChip, AIInsightCard and consistent list/detail interaction patterns across modules.
- Complete translation coverage and offline queue behavior for all critical workflows.
- A single agent runner satisfying every Section 13 governance requirement; prompt versioning, allow-list enforcement, kill switch, budget enforcement, action reversal and eval-gated releases need end-to-end proof.
- Reliable event outbox dispatcher/retry/dead-letter monitoring across domain events.
- Integration health, retry, reconciliation and sandbox contract tests for every external connector.
- End-to-end Playwright evidence for order-to-dispatch, GRN-to-payment, attendance-to-payroll, and mobile/offline paths.
- Staging restore/backup drills, load test, penetration/red-team tests and owner/department acceptance sign-offs.
- Durable full report copy at `docs/blueprint.md` (see source fidelity note).

## 5. Technical debt and risk register

1. **Critical verification blocker — live DB access/project identity unknown.** No database changes until the linked Supabase account and deployed project/schema are confirmed.
2. **Migration drift risk.** Supabase SQL, Drizzle migrations, accounting-phase SQL and manufacturing-phase SQL coexist. Establish one migration authority and CI drift detection before adding new domain schema.
3. **Authorization complexity.** Many migrations specifically harden company boundaries. New policies must be tested for permissive-policy OR behavior, parent-child tenant isolation, role/company changes and RPC execute grants.
4. **Generated schema drift.** Drizzle schema is blank while Supabase types and SQL migrations are used; clarify generated artifacts and make CI fail on stale types.
5. **Broad scope/duplication.** Several phase folders and legacy importer modules coexist. Map and reuse them; do not create parallel engines.
6. **Test evidence vs behavior.** Unit tests are numerous but cannot replace live RLS/pgTAP, deployed schema verification, contract tests and browser E2E.
7. **Secrets/config hygiene.** A tracked `.env` file exists. Values were deliberately not printed. Audit tracked environment files, ensure no service-role/private keys are committed, move secrets to hosting secret stores, and rotate any exposed secret if discovered.
8. **External side effects.** WhatsApp, banking, GST, shipping, Tally and biometric actions must remain disabled/mock until sandbox credentials, idempotency, retry, audit and reconciliation are tested.
9. **AI injection/overreach.** Treat uploaded content as untrusted; agents get typed allow-listed tools, never SQL; money/price/hiring/statutory actions require human approval.
10. **Data migration risk.** No destructive schema changes or live imports without restorable backup, staging reconciliation, idempotency and rollback proof.

## 6. Mapping existing repository to WS0–WS8

| Workstream | Existing code to reuse | Status from this source audit | Main gap / next verification |
|---|---|---|---|
| WS0 Platform foundation | auth/app-access, permissions, company context, approvals, notifications, Supabase migrations, shared components, CI | In progress | Confirm every table/storage/RPC boundary, full i18n/offline, universal audit and policy tests |
| WS1 Master data and migration | parties/items/models/BOM/price screens; Tally import/local accounts/staging; data-quality tests | In progress | Complete canonical master map, duplicate resolution and Tally/Excel reconciliation |
| WS2 Transaction engines | sales/invoices/purchases/inventory/production/QC/dispatch/finance/HR routes and posting functions | In progress | Prove complete order-to-cash and procure-to-pay; ensure one stock/GL posting path |
| WS3 Integrations | tally-bridge, biometric-sync, communications/WhatsApp, GST/banking, Velocity | In progress | Per-connector sandbox contract, retry, health, idempotency and reconciliation |
| WS4 AI platform | AI routes, assistant, document AI, agent-router, audit, forecast, AI migrations | In progress | One governed runner; tool registry, budgets, prompt versions, approval/undo and eval gate |
| WS5 Analytics and models | dashboard/reports, accounting views, inventory/MRP/forecast helpers | In progress | KPI definitions and source lineage; validated forecasts/optimizers/scenarios |
| WS6 Agents | assistant/agent-router/briefs/proposals/quotations/document extraction | In progress | Build/evaluate all Section 13 agents in specified dependency order |
| WS7 Interfaces | responsive routes, public store, vendor portal, shop-floor, PWA support/tests | In progress | Complete role-specific PWA/portal/display/voice interfaces, four languages and offline E2E |
| WS8 Governance and hardening | security audit register, security tests, production readiness/cutover docs, CI workflows | In progress | Live DB audit, penetration/red-team, load, restore drill, DPDP review, runbooks and sign-off |

## 7. Dependency order recommended

Follow Section 14.6 exactly; dependencies are not dates:
1. WS0 platform foundation.
2. WS1 master data and migration tools.
3. WS2 transaction engines (some domain work may proceed in parallel only where its dependencies are explicit).
4. WS3 integrations and WS4 AI platform once the foundational data/security contracts are available; keep mock/sandbox modes until approved.
5. WS5 analytics/models once transactional data semantics and lineage are reliable.
6. WS6 agents in the exact platform → analyst → drafting → bounded-acting order in the blueprint.
7. WS7 interfaces connected to stable domain contracts.
8. WS8 hardening/acceptance gates continuously, with final sign-off after the preceding exit criteria pass. Security review is continuous, not postponed to the end.

## 8. Contradictions / decisions needed

1. **Supabase account link:** the available connector cannot list projects/tables because no eligible linked account is selected. Please reconnect/authorize the correct Supabase account, or provide the project identifier and grant the required read-only connector access. Do not send any secret key in chat.
2. **Migration authority:** repo has both Supabase and Drizzle migration tracks plus phase-specific SQL. Recommendation: Supabase CLI migrations are authoritative for Supabase deployment; Drizzle is retained only if actively used and CI validates parity. Confirm.
3. **Blueprint file:** the PDF has 69 pages and detailed prompt/schema/screen text. The GitHub file-writing connector accepts UTF-8 text but not a direct PDF binary upload. This branch's `docs/blueprint.md` explicitly identifies itself as an index, not a verbatim copy. Please either (A) approve the source PDF as the original PDF source (not stored in the repository) via normal Git file upload, or (B) require full Markdown transcription as a separate task. Recommendation A preserves exact fidelity.
4. **Multi-company data boundaries:** existing migrations show a four-company access workflow and special management/estimate books. The report's generic company model must be reconciled to the existing approved-book rules; do not infer company identities or broaden access. Recommendation: preserve current controls and map the report to them.
5. **No code/deploy:** no application code, database or production deployment changes were made. PR #124 contained audit documentation only and has since been merged. Follow-up documentation work continues on `feature/audit-blueprint-baseline`.

## 9. Questions requiring owner response before implementation

- **Q1 — Supabase read-only audit access:** reconnect the correct Supabase connector (recommended), or choose a source-level-only audit that leaves live DB findings marked unverified.
- **Q2 — Migration policy:** approve Supabase CLI as the sole deployment migration source, with Drizzle schema either generated/validated or explicitly retired from schema ownership? Recommendation: Supabase CLI is authoritative.
- **Q3 — Blueprint persistence:** commit the exact source PDF as the original PDF source (not stored in the repository) (recommended), or require the entire 69-page document to be transcribed into Markdown? No need to change any application code either way.
- **Q4 — Baseline:** confirm the repository's `main` at `e4658ea` is the baseline to build on; existing work in other open PRs will be audited separately before merge.

**Audit status:** source-level audit and mapping documented; PR #124 merged. Owner decisions on baseline, migration authority and exact PDF persistence are received. Live database audit remains blocked by project authorization; exact PDF binary commit remains outstanding. No application code changes or production operations performed.


## Step 0 owner decisions — 2026-10-19

- **Baseline confirmed:** use `main` at `e4658ea188b76095903e133df7b5669affb68a46`; review other open PRs separately. Do not merge them as part of Step 0.
- **Migration authority confirmed:** Supabase CLI migrations are authoritative for deployed schema. Drizzle must be validated against that source; it must not act as an independent schema authority.
- **Blueprint persistence confirmed:** commit the exact original PDF as the original PDF source (not stored in the repository); `docs/blueprint.md` remains a navigational index, not a replacement.
- **Supabase access decision confirmed, blocker unresolved:** both currently available connector links list only `orderweaver-erp` at ref `ibnacjirwnhbtqrirdsz`, while repository config names `ysaocrumxikgywdotkne`. The correct project/account must be reauthorized before live schema, RLS, function, storage and migration-state checks can be performed.
- **PDF commit blocker:** the available GitHub file-writing action accepts UTF-8 text only and does not provide a direct binary upload action. The PDF is not committed yet; use a binary-capable Git workflow and verify the committed file is byte-for-byte identical to the supplied source.
- **Scope guard:** no application-code changes, migration execution, production data writes, or production deployment until the remaining Step 0 blockers are resolved and the next phase is explicitly approved.


## Step 0 live-read verification update — 2026-10-19

### Supabase connector discovery (read-only)

Both currently listed Supabase connector links (Primary and reee) resolve to the same single project:
- Project name: orderweaver-erp
- Project ref: ibnacjirwnhbtqrirdsz
- Status: ACTIVE_HEALTHY
- Organization: Ree

This does not match the repository's configured project ref ysaocrumxikgywdotkne, nor the documented production project ref cited by existing open PRs. The correct production project is therefore not yet identified/authorized through the available connector. Do not treat the connected ibnacjirwnhbtqrirdsz database as production or apply changes to it.

Read-only catalog observations from ibnacjirwnhbtqrirdsz:
- Deployed migration ledger lists seven migrations, versions 20261006132937 through 20261010044700.
- The public schema listing returned one table: public.tally_archive_uploads; RLS is enabled; row count is zero.
- The Supabase security advisor returned zero lint findings for this project.
- These observations are limited to the connected project and do not verify the real ERP production database. Zero advisor lints is not a security certification.

### Owner decisions applied

- Supabase CLI migration history is authoritative for deployment. Drizzle must be validated against it and must not act as an independent schema authority.
- Original PDF must be committed byte-for-byte at docs/blueprint.pdf; docs/blueprint.md remains an index.
- Baseline remains main at e4658ea188b76095903e133df7b5669affb68a46; review other open PRs separately.

### Remaining Step 0 blockers

1. Reauthorize the Supabase account that owns the actual ERP production project ref ysaocrumxikgywdotkne (or explicitly identify the correct production project). Do not share keys in chat.
2. Commit the exact source PDF through a binary-capable Git workflow. The available GitHub connector file-content operation only writes UTF-8 text; the PDF has not been committed. Verify the committed PDF's SHA-256 matches the supplied source: ea9d33339005a1622a455c4ee757fb39fa15714b40c35a5be5c6181d4c227937.
3. Review other open PRs against the confirmed baseline as separate reviews. No PR is merged by this audit.
4. After the correct project is available, compare its migration ledger with repository supabase/migrations/, inspect live tables/RLS/policies/function grants/storage/realtime, and validate Drizzle artifacts against the Supabase CLI migration source.

Guardrail: Step 0 remains open. No application code, migrations, live business data, or production deployment were changed.


## Source-only schema and control review — 2026-10-19

### Evidence boundary — read this first

This section is based on repository source at the confirmed baseline `e4658ea188b76095903e133df7b5669affb68a46`: the Supabase migration directory inventory (117 SQL files), selected foundational/security/AI migration definitions, the generated Supabase TypeScript table declarations, and the supplied PDF Sections 11.1–11.16 and 13. It is a static-source assessment, not a complete SQL execution simulation.

**Every statement about the live database, applied migration versions, current RLS/policies/grants, existing live rows, storage, Realtime, or production behavior is UNVERIFIED in this pass.** The available Supabase connector points to a project whose reference differs from the repository config. Historical statements in older security docs about live catalog reads are not revalidated by this source-only review and must not be treated as current proof. No live database was queried or changed.

The generated `src/integrations/supabase/types.ts` contains 156 table-like declarations before its view/function declarations. That file is a useful repository schema index, but it can be stale or generated from a different database; it does not prove all migrations apply cleanly or that any table exists live.

### 1. RLS and company-separation patterns found in source

| Source pattern | What the SQL intends | Source-level limitation / follow-up |
|---|---|---|
| `20261004123000_multi_company_foundation.sql` | Creates `companies` and `user_company_access`; enables RLS and policies on these two tables. | Does not alone establish tenant isolation for every business table. |
| `20261004124500_multi_company_accounting_constraints.sql` | Uses a dynamic table list to add `company_id`, indexes, company-context trigger and company-scope policies to listed tables. | Coverage is allowlist-based, not automatically universal. Verify list completeness and all child-table joins. |
| `20261006150000_four_company_access_workflow.sql`, `20261006151000_company_scope_restrictive_policies.sql`, `20261006160000_business_record_link_scopes.sql`, `20261006194000_security_company_boundaries.sql`, `20261006210000_final_security_boundary_hardening.sql`, and subsequent hardening migrations | Add approved-book restrictions, restrictive company policies, linked-record checks and guarded RPCs for selected sensitive flows. | Policy composition, function grants, dynamic SQL target lists and all linked tables still require a table/function matrix and disposable-PostgreSQL adversarial tests. Live effect is unverified. |
| `20261008120000_global_erp_capability_foundation.sql` | Creates the enterprise-domain tables and applies company-scope CRUD policies through a dynamic allowlist using `current_company_id()` and `has_company_access()`. | The base policy pattern does not itself include an approved-profile predicate; later approval hardening is intended to add that layer. The allowlist and every policy combination require review. |
| `20261008123000_ai_hr_platform_governance.sql` | Creates AI/HR governance tables and dynamically enables RLS / company-scope CRUD policies for its listed tables. | The migration's company-only pattern is broad for sensitive AI/HR rows; the later `20261018170000_require_approved_data_access.sql` explicitly removes these company-scope policies and revokes browser-role privileges on a fail-closed subset until purpose-built policies exist. This intentionally leaves some new workflows inaccessible rather than safely complete. |
| `20261018170000_require_approved_data_access.sql` | Source code adds a restrictive `approved_profile_required` policy to each existing public ordinary table that already has RLS, except `profiles`; it also revokes selected table-level privileges and locks down listed AI/HR tables. | This is intended migration behavior only. It cannot prove the migration was applied to the intended project; tables without RLS are not covered by that loop. |
| `20261008200000_ai_conversation_company_isolation.sql` | Adds `company_id` to AI conversations and constrains conversation/message policies to the caller's active company and owned conversation. | Legacy conversations without company attribution are intentionally not guessed. Validate message parent/child policy and old-row accessibility in tests. |
| `20261018210000_ai_marketing_creative_studio.sql` | Marketing creatives have company-scoped CRUD policies requiring an approved profile and membership permissions; generated assets use a private bucket with company-folder checks. | This is a specific example, not proof that every storage bucket or every business table has equivalent rules. Storage policy behavior is not live-verified. |

**RLS conclusion:** the source contains multiple real security layers, including company-scoped and restrictive policies. It does not justify the claim that every table is fully secured. The main source risks are table-list drift, inconsistent policy predicates across generations, reliance on `has_company_access` without approval in earlier policy sets, and child-record/RPC/grant paths that need explicit testing.

### 2. Audit logging and status history

**Found in source:** `erp_domain_audit_log` (company/module/entity/action, before/after JSON, actor, reason and timestamp); `ai_audit_log`; `voucher_audit_log`; and specific posting/sync/event timestamps and audit triggers/functions in selected migrations. Server-authoritative timestamps and posting audit hardening are present in the source.

**Not demonstrated as universal:** a generic audit trigger attached to every Section 11 business table; consistent `created_by`, `updated_by`, `deleted_at` columns across every table; immutable before/after snapshots for every mutation; or a generic `status_history` table used by every status transition. `erp_domain_audit_log` creation alone does not attach audit triggers to all the tables. Several tables use `created_at` / `updated_at` but omit actor fields or soft-delete fields. The source includes selected updated-at triggers, not proof of universal audit coverage.

**Assessment:** partial. Produce a per-table audit-trigger/actor/timestamp/status-history matrix before claiming the Section 11.1 convention is satisfied. Verify audit-log write permissions prevent client forgery and that sensitive before/after data is access-restricted.

### 3. Approval handling

**Found in source:** many domain records include draft/review/approved/released statuses and fields such as `approved_by` / `approved_at`; `ai_action_proposals` includes `pending_approval`, `approved`, `rejected`, `executed` and `cancelled`; migration-run approval is a guarded Admin RPC requiring validation, no unresolved critical issues and reconciliation without differences; PLM/ECO, QC release, maintenance completion and selected finance/vendor flows have explicit guards.

**Missing as blueprint-named central tables:** no `approval_rules` or `approval_requests` table definition was found in the reviewed Supabase migration source or in the generated table declarations. The existing `/approvals` UI and domain-specific status fields are not by themselves a substitute for the blueprint's amount/action-based central approval matrix and request lifecycle. The exact blueprint's central generic approval table pattern is therefore **missing / not evidenced**; related domain approvals are **partial**.

### 4. Section 11 table inventory — repository source, not live database

Status meanings: **Exists** = a corresponding table is declared in the repository schema/migration source; **Partial** = an equivalent or subset exists but the blueprint shape/coverage is incomplete; **Missing** = no corresponding table was identified in the reviewed migration/type source; **Live unverified** applies to all statuses.

| Section 11 area | Exists / partial in repository source | Missing or partial against the PDF specification |
|---|---|---|
| **11.2 Foundation** | `companies`, `profiles`, `user_roles`, `user_company_access`; `erp_domain_audit_log`, `ai_audit_log`, `voucher_audit_log`; `in_app_notifications`, `notification_events`, `notification_log`; `voucher_number_series`. | **Missing as named / incomplete:** `branches`, generic `roles`, `permissions`, `role_permissions`, `event_outbox`, `approval_rules`, `approval_requests`, generic `attachments`, generic `status_history`, and general-purpose `number_series`. Current role/company-access structures are not a one-to-one copy of the PDF foundation model. |
| **11.3 Master data** | `parties`, `suppliers`, `product_models`, `stock_items`, `raw_materials`, `godowns`, `warehouse_zones`, `warehouse_bins`, `financial_years`, `cost_centers`, `hsn_codes`, GST/tax-related tables. | **Partial/missing:** party address/contact and customer/supplier profile submodels, territories, UOM conversions, item categories, explicit model variants, locations/racks, price lists/items/schemes, and a unified tax-code model. Some fields may live in existing master tables, but the PDF's full normalized model is not evidenced. |
| **11.4 Sales/dealers/CRM** | `crm_leads`, `crm_opportunities`, `crm_activities`, `sales_orders`, `sales_order_items`, `invoices`, `invoice_items`, `sales_returns`, `website_enquiries`. | **Partial/missing:** normalized quotations/lines and versioning, lead activity model distinct from general CRM activity, visits/check-ins, showroom walk-ins, dealer claims, sales targets, customer scores and credit notes as distinct business objects. Existing invoices/orders provide a foundation but do not establish every specified workflow. |
| **11.5 Credit/collections** | Invoice/party-ledger/bill tables and outstanding views/functions provide some receivable/accounting capability. | **Partial/missing:** explicit receivable ledger/receipt allocations, credit holds with approval reference, collection tasks, payment promises, collection message history, disputes and credit-limit reviews. Verify whether any equivalent is represented in existing accounting tables/functions before designing replacements. |
| **11.6 Production/manufacturing** | `production_orders`, `production_operations`, `routings`, `routing_operations`, `routing_operation_dependencies`, `work_centers`, `work_center_calendars`, `mps_plans`, `mps_lines`, BOM revision tables, `model_boq`, maintenance assets/plans/work orders, selected quality tables. | **Partial/missing:** exact `boms` / `bom_lines` and stage model (BOM revisions/lines are related, not identical); production plan lines, QR `job_cards`, material issues/lines, production output/serial-number/warranty traceability, wastage logs, shift assignments, machine registry/telemetry/downtime events, spare-parts-by-machine, and unit-cost snapshots. |
| **11.7 Inventory/procurement** | `stock_items`, `stock_batches`, `stock_movements`, `stock_journals`, `stock_journal_entries`, `stock_reservations`, `stock_counts`, `stock_count_lines`, RFQ/quote tables, `purchase_receipts`, `purchase_receipt_lines`, `purchase_bills`, `purchase_bill_items`, `three_way_match_results`, supplier scorecards and landed-cost tables. | **Partial/missing:** blueprint-named immutable `stock_ledger` and `stock_balances` are represented by a different stock-journal/movement model and views; stock transfer/adjustment document families, reorder suggestions, purchase requisitions, RFQ responses/quote comparisons, purchase orders/lines, GRN lines as a distinct model, supplier payment/supplier price history, and commodity market prices are not all evidenced as separate tables. Validate canonical posting path and prevent direct writes. |
| **11.8 Finance/accounting** | `ledger_accounts`, `ledger_groups`, `vouchers`, `voucher_entries`, `bank_accounts`, `bank_transactions`, `bank_reconciliations`, `bank_reconciliation_items`, `budgets`, `budget_lines`, `fixed_assets`, `fixed_asset_depreciation`, `e_invoices`, `e_way_bills`, GST returns, invoice tax snapshots, Tally migration/sync-related objects. | **Partial/missing:** exact `accounts` / `journal_entries` / `journal_lines` are represented by a different ledger/voucher model; expense claims/petty cash, tax filing workpapers, generic e-invoice/e-way logs, Tally sync job/map tables, cash-flow forecasts and profitability snapshots are not all evidenced as separate canonical tables. Existing voucher/accounting functions must remain authoritative. |
| **11.9 HR/workforce** | `employees`, `attendance`, `punch_events`, `payslips`, `employee_leave_requests`, `employee_lifecycle_events`, `employee_performance_cycles`, `employee_training_records`, shift settings and notifications. | **Partial/missing:** full employee/department/designation and biometric-device/punch separation, attendance-day regularization, shifts/assignments, leave types/balances, overtime, salary structures/components, payroll runs/payslip lines, piece-rate cards/earnings, advances/loans, recruitment/candidates/interviews, certifications, safety incidents, grievances and employee documents. |
| **11.10 Quality/warranty** | `quality_plans`, `quality_inspections`, `quality_results`, `quality_nonconformances`, `quality_capa_actions`; QC release and CAPA/maintenance completion guards. | **Partial/missing:** blueprint-named QC table aliases are different; defect-code master, complaints, warranty registrations/claims, serial-to-batch/machine/operator traceability, calibration records and recall simulation data are not evidenced as a complete model. |
| **11.11 Logistics/delivery** | `shipments`, `shipment_lines`, and supporting inventory/company-scoped functions; fleet/fuel management is represented in recent migrations. | **Partial/missing:** explicit vehicles/drivers, dispatch plans/notes/lines, delivery/POD records and event tracking, freight rates/bills and return pickups are not evidenced as a complete, connected model. Shipment status alone must not be assumed to post stock/accounting. |
| **11.12 Marketing/e-commerce** | `marketing_campaigns`/campaign-management objects in recent migrations, `marketing_creatives`, `website_enquiries`, `whatsapp_templates`, CRM leads/activities. | **Partial/missing:** campaign spend/lead attribution as a complete ROI model, marketplace listings/orders, approved/published content asset lifecycle, reviews/sentiment, loyalty/referrals, WhatsApp conversation/message history, competitor/price monitoring and exhibitions/events. |
| **11.13 Product development/smart products** | `projects`, `project_tasks`, `product_models`, BOM revisions/lines, engineering change orders/lines. | **Partial/missing:** prototypes/test results, cost scenarios, smart devices and consent-aware device events, firmware releases, dedicated smart BOM, and feature-request/review linkage. |
| **11.14 Executive/governance** | `projects`, `project_tasks`, `workflow_definitions`, `workflow_instances`, `workflow_tasks`, `data_quality_issues`, `ai_data_freshness`, integration health/runs and backup-verification runs. | **Partial/missing:** KPI definitions/values, OKRs/key results, task updates, meetings/minutes, risk register, compliance calendar, licences/insurance, daily briefs and scenario records. |
| **11.15 AI platform** | `ai_documents`, `ai_document_chunks`, `ai_insights`, `ai_conversations`, `ai_messages`, `ai_proposals`, `ai_audit_log`, `ai_skills`, `ai_alerts`, `ai_context_bindings`, `ai_action_proposals`, `ai_answer_evaluations`, `ai_forecast_models`, `ai_data_freshness`. | The exact Section 11.15 agent runtime/evaluation/budget/knowledge schema is substantially incomplete; detailed matrix below. |

This is a source-equivalence inventory, not a proposal to create every PDF-named table verbatim. Before schema design, reconcile equivalent existing tables/functions to avoid parallel ledgers or duplicate domain engines.

### 5. Section 11.15 AI table-by-table comparison

The PDF requires `agents`, `agent_prompt_versions`, `agent_tools`, `agent_triggers`, `agent_runs`, `agent_steps`, `agent_actions`, `agent_feedback`, `agent_memory`, `knowledge_documents`, `knowledge_chunks`, `eval_cases`, `eval_runs`, `model_gateway_log`, `ai_budgets`, `conversations`, `conversation_messages`, `forecast_models`, `forecast_runs`, `anomaly_rules` and `anomaly_findings`.

| PDF table | Source assessment | Evidence / gap |
|---|---|---|
| `agents` | **Partial equivalent** | `ai_skills` has skill code, description, retrieval contract, action policy, active/version fields; no complete agent registry with named owner, autonomy 0–4, model policy, prompt version, tool allowlist, amount/action limits and pause/kill switch was identified. |
| `agent_prompt_versions` | **Missing** | No versioned prompt table with approval/evaluation/live promotion fields identified. |
| `agent_tools` | **Missing** | No central typed tool registry with input schema, risk level, approval requirement and handler contract identified in the migration/type source. |
| `agent_triggers` | **Missing** | No per-agent event/schedule/manual/message trigger table identified. |
| `agent_runs` | **Missing / partial** | `ai_action_proposals`, `ai_alerts` and `integration_runs` record related but different concepts; no general agent execution/run lifecycle with input/output/tokens/cost/error/awaiting-approval was identified. |
| `agent_steps` | **Missing** | No per-run ordered tool-call/result timeline table identified. |
| `agent_actions` | **Missing / partial** | `ai_action_proposals` stores proposed payload/status but does not replace a committed action ledger with before/after values, approval link and reversible-action state. |
| `agent_feedback` | **Missing** | No run-linked accepted/edited/rejected feedback table identified. |
| `agent_memory` | **Missing** | No scoped party/supplier/machine/user/global memory table with embedding was identified. |
| `knowledge_documents` | **Partial equivalent** | `ai_documents` exists, but its schema/lifecycle must be mapped to the PDF's document type, storage path, version and language contract. |
| `knowledge_chunks` | **Partial equivalent** | `ai_document_chunks` exists and retrieval/matching code exists; verify embedding dimensions, metadata, document version/supersession and company/permission filtering. |
| `eval_cases` | **Missing** | No persisted per-agent expected-input/output test-case table identified. |
| `eval_runs` | **Partial equivalent** | `ai_answer_evaluations` records evaluations, but does not establish per-prompt-version test-run scores/details or promotion-blocking evaluation gates. |
| `model_gateway_log` | **Missing** | No dedicated per-run provider/model/token/cost/latency/cache log table identified. |
| `ai_budgets` | **Missing** | No daily/monthly agent budget and spent-amount table identified. |
| `conversations` | **Exists under different name** | `ai_conversations`; source migration adds company isolation and active-company/user-owned policies. Live enforcement remains unverified. |
| `conversation_messages` | **Exists under different name** | `ai_messages`; source policy ties messages to owned conversations and active company. Live enforcement remains unverified. |
| `forecast_models` | **Partial equivalent** | `ai_forecast_models` exists, but validate fields against target, algorithm/parameters and accuracy metrics required by the PDF. |
| `forecast_runs` | **Missing / partial** | `integration_runs` is not a forecast run ledger; no dedicated forecast output/history table identified. |
| `anomaly_rules` | **Missing** | No rules registry with conditions, thresholds, ownership and active state identified. |
| `anomaly_findings` | **Partial equivalent** | `ai_alerts` and `data_quality_issues` capture alerts/issues, but the dedicated rule-linked anomaly finding model and reviewed-by lifecycle are not evidenced. |

### 6. Section 13 agent runtime and governance gap

**Present as partial foundations:** AI document retrieval, assistant/conversation tables, proposal records, skill/action-policy metadata, alerts/context bindings, answer evaluations, forecast model metadata, AI audit records and company-isolation policy definitions.

**Not evidenced as one governed runtime:** every run going through a common orchestrator; database-stored prompt versions; strict per-agent typed tool allowlists and user-permission checks on every call; validated input/output schemas; amount/action/day and model-cost budgets enforced in code; run/step/action logs; before/after action snapshots and undo; run-linked human approvals; per-agent and global kill switches; a minimum evaluation suite (the PDF requires at least 30 cases per agent), injection/approval-bypass/privacy-leakage tests, approval-gated prompt promotion, and monitored acceptance/override/error/cost thresholds.

**Safety conclusion:** do not enable bounded-acting agents on the strength of the current tables alone. The Section 13 runtime is **partial/incomplete in source evidence**; live deployment and enforcement are unverified. Continue treating all external content as untrusted, all numeric facts as tool-derived, and money/pricing/hiring/statutory actions as human-approved.

### 7. Source-only conclusions and next audit actions

1. The repository has meaningful RLS/company-isolation and workflow hardening, but it is not source-evidenced as meeting the PDF's universal per-table RLS + audit + status-history conventions.
2. The broad enterprise-domain migration uses a dynamic allowlist; record its complete target list and compare it to all table declarations. Do the same for approval-policy and HR/AI lockdown lists.
3. Build the definitive inventory from the authoritative Supabase CLI migration sequence: one row per table with create migration, company/branch columns, RLS enablement, permissive policies, restrictive policies, grants, approval predicate, audit trigger/actor fields, soft-delete/status history, child-table link checks and test reference.
4. Compare the 156 generated type declarations to the final migration-derived schema and regenerate only in a controlled source-only workflow; do not infer live schema from types.
5. Resolve project identity before reading migration ledger/catalog. Then perform read-only catalog comparison first; no migration application or database writes are authorized by this task.
6. Reconcile existing equivalent models with Section 11 before proposing any schema changes. Avoid creating duplicate accounting, stock, AI conversation or document stores.
7. All live-database findings in historical docs are unverified for this pass. Re-validate them against the correct project and annotate with date/project reference before relying on them.

No application code, migration files, database, production data or deployment was changed during this source-only review.


## Post-merge continuation — 2026-10-19

- PR #124 is merged; `main` is at `a9c0ea39932ce22e3384b6e86046f7bb9b557370` at the time of this follow-up.
- The existing `feature/audit-blueprint-baseline` branch was advanced to that same commit before further documentation work.
- The migration inventory contains 117 SQL files. The prior review sampled migration definitions and generated declarations; it did **not** inspect every SQL statement in every file. Do not represent the existing assessment as a completed one-row-per-table proof.
- A regex-based spot-check of early migrations shows several foundational table batches do enable RLS and define policies, but that alone cannot establish policy correctness, restrictive/permissive interaction, grants, child-row isolation, audit coverage, or live deployment state.
- Next source-only audit deliverable: produce a reproducible migration-derived table/control matrix with explicit evidence references and an `unknown/not evidenced` state wherever dynamic SQL, policy replacement, grant behavior, or migration ordering prevents a reliable static conclusion. The matrix must distinguish source declarations from live verification.
- Live Supabase schema, RLS, grants, storage, Realtime and applied migration ledger remain **UNVERIFIED** until the correct project is authorized and inspected read-only.
- The exact source PDF remains not committed; preserve byte-for-byte SHA-256 `ea9d33339005a1622a455c4ee757fb39fa15714b40c35a5be5c6181d4c227937` when adding the original PDF source (not stored in the repository) through a binary-capable Git workflow.


## Blueprint preservation and follow-up source review — 2026-10-19

### Attached blueprint checks

- Attached Markdown local-file SHA-256: `93e3bd78362882a7e0bc3e49977d104c78a7f06aedf8e623267a3711f325a04c`; 137,124 characters, UTF-8, no CRLF, final newline present.
- Committed `docs/blueprint-full.md` fetched back from GitHub reports 137,122 characters. Its content hash has not been independently computed in the current workflow, and the counts differ. **Verbatim preservation is not verified.** The connector's file read appears to have omitted two characters relative to the local attachment; exact offset has not been identified. Do not use this file as a verified byte-for-byte copy until fixed and rechecked.
- The returned committed heading inventory contains: Sections 1 Executive Summary; 2 The AI Architecture; 3 Module-by-Module Design; 4 Agent Orchestration; 5 Trust, Safety and Governance; 6 Suggested Technology Stack; 7 Build Order by Dependency; 8 KPIs to Prove It Works; 9 Risks and How to Handle Them; 10 Quick Wins; 11 Database Design; 12 Screens and User Experience; 13 AI Agents: Runtime, Prompts and Tools; 14 Supabase and React Build Plan. Section numbering is present in the returned text, but headings alone do not establish content integrity.
- Uploaded PDF checksum: `ea9d33339005a1622a455c4ee757fb39fa15714b40c35a5be5c6181d4c227937` (2,547,569 bytes). Binary upload is unavailable through the current GitHub text-writing workflow. Owner must upload the PDF to the original PDF source (not stored in the repository) on GitHub; after confirmation, compare the repository copy's SHA-256 with this recorded value.

### New documentation

- `docs/blueprint.md` now says `docs/blueprint-full.md` is the intended authoritative text, the original PDF source (not stored in the repository) is the original PDF, and the index is navigation only. The Markdown checksum mismatch means the authority copy is not yet verified.
- `docs/SECURITY_MATRIX.md` is a preliminary evidence register. It has source-level findings for selected tables, but explicitly remains incomplete and includes a grouped tracking row. It does **not** yet satisfy the requested exhaustive one-row-per-table matrix. Unknown remains unknown; source declarations are not live verification.
- `docs/MIGRATION_PLAN.md` records Supabase CLI as the owner-selected migration authority and a no-destructive-change consolidation approach for Drizzle and phase folders.
- `docs/WS0_GAP_PLAN.md` drafts additive approval, audit, status-history and number-series migrations, risks, rollback approach and staging tests. No migration files were created or edited.

### Safety boundary

No application code, existing migration, database or production data was changed or accessed. Live schema, policies, grants, storage, Realtime and applied migration ledger remain **UNVERIFIED**. No merge or deployment occurred.


## Original source checksum (reference only)

Original source PDF checksum (reference only; PDF is not stored in this repository): SHA-256 `ea9d33339005a1622a455c4ee757fb39fa15714b40c35a5be5c6181d4c227937` (2,547,569 bytes).
The PDF is not stored in this repository and is not required for future work. `docs/blueprint-full.md` is the authoritative blueprint text. Its source-fidelity verification is tracked separately; do not claim byte-for-byte verification until the original source and committed blob hashes match.
