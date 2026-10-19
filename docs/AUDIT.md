# Repository Audit — Blueprint Alignment

**Audit date:** 2026-10-19  
**Repository:** `rafah786-cloud/orderweaver-erp`  
**Audited baseline:** `main` at `e4658ea188b76095903e133df7b5669affb68a46`  
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
- **Blueprint copy:** `docs/blueprint.md` created by this audit branch is a structured index/summary, not a verbatim 69-page transcription. This limitation is called out in the file. The original PDF still needs to be committed as a binary companion or its detailed field lists/screen definitions/prompts copied in full before repository-local specification is complete.

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
3. **Blueprint file:** the PDF has 69 pages and detailed prompt/schema/screen text. The GitHub file-writing connector accepts UTF-8 text but not a direct PDF binary upload. This branch's `docs/blueprint.md` explicitly identifies itself as an index, not a verbatim copy. Please either (A) approve the source PDF as `docs/blueprint.pdf` via normal Git file upload, or (B) require full Markdown transcription as a separate task. Recommendation A preserves exact fidelity.
4. **Multi-company data boundaries:** existing migrations show a four-company access workflow and special management/estimate books. The report's generic company model must be reconciled to the existing approved-book rules; do not infer company identities or broaden access. Recommendation: preserve current controls and map the report to them.
5. **No code/deploy:** no application code, database or production deployment changes were made. This PR contains audit documentation only and should be reviewed/merged by the owner.

## 9. Questions requiring owner response before implementation

- **Q1 — Supabase read-only audit access:** reconnect the correct Supabase connector (recommended), or choose a source-level-only audit that leaves live DB findings marked unverified.
- **Q2 — Migration policy:** approve Supabase CLI as the sole deployment migration source, with Drizzle schema either generated/validated or explicitly retired from schema ownership? Recommendation: Supabase CLI is authoritative.
- **Q3 — Blueprint persistence:** commit the exact source PDF as `docs/blueprint.pdf` (recommended), or require the entire 69-page document to be transcribed into Markdown? No need to change any application code either way.
- **Q4 — Baseline:** confirm the repository's `main` at `e4658ea` is the baseline to build on; existing work in other open PRs will be audited separately before merge.

**Audit status:** source-level audit and mapping documented; live database audit blocked by connector authorization; awaiting owner decisions. No application code changes or production operations performed.


## Step 0 owner decisions — 2026-10-19

- **Baseline confirmed:** use `main` at `e4658ea188b76095903e133df7b5669affb68a46`; review other open PRs separately. Do not merge them as part of Step 0.
- **Migration authority confirmed:** Supabase CLI migrations are authoritative for deployed schema. Drizzle must be validated against that source; it must not act as an independent schema authority.
- **Blueprint persistence confirmed:** commit the exact original PDF as `docs/blueprint.pdf`; `docs/blueprint.md` remains a navigational index, not a replacement.
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
