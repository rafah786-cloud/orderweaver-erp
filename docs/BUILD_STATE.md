# Build State — AI-Assisted Business Management Environment

> **LIVE-DATABASE STATUS: UNVERIFIED.** Source-only review only. No live schema, RLS, grants, storage, Realtime, migration ledger or production behavior was verified in this task.

**Last updated:** 2026-10-19  
**Baseline:** `main` merge commit `a9c0ea39932ce22e3384b6e86046f7bb9b557370` (PR #124 merged)  
**Current task:** Step 0 audit only. No application code, migrations, production data or deployments changed.

## Current gate
- [x] Read supplied blueprint structure and dependency workstreams WS0–WS8.
- [x] Inventory repository structure, stack/package scripts, route list, migration tracks, tests, docs and environment-variable names (no values).
- [x] Create source-level audit and mapping.
- [ ] Verify actual ERP production schema, policies, functions, storage and deployed migration state — blocker: both available Supabase links expose ref ibnacjirwnhbtqrirdsz, while repo config/documentation identifies ysaocrumxikgywdotkne. Read-only inspection of the former found seven migration records and only public.tally_archive_uploads; do not treat it as production.
- [ ] Commit the exact 69-page source report as the original PDF (not stored in this repository) byte-for-byte — owner decision confirmed; connector has no direct binary upload path, so a binary-capable Git workflow is still required. Source SHA-256: ea9d33339005a1622a455c4ee757fb39fa15714b40c35a5be5c6181d4c227937.
- [x] Owner decisions Q1–Q4 received; Supabase project identity and exact-PDF binary upload remain technical blockers.
- [x] Documentation-only PR #124 merged to `main` at `a9c0ea39932ce22e3384b6e86046f7bb9b557370`. No production deployment occurred.

## Workstream tracker

| Workstream/module | Status | What exists | Next | Open questions/risks |
|---|---|---|---|---|
| WS0 Platform foundation | in progress | Auth, route role policies, company context, approvals/notifications, many RLS/security migrations, CI | Verify live RLS/storage/RPCs, audit coverage, i18n/offline and role tests | Supabase connector access; migration authority |
| WS1 Master data/migration | in progress | Party/item/product/BOM areas; Tally import, local bridge, XML staging/validation | Master data quality, complete import mapping and source reconciliation | Four-company mappings must respect existing book boundaries |
| WS2 Transaction engines | in progress | Sales, invoices, purchases, inventory, production, MRP, QC, maintenance, shipments/fleet, finance, HR/payroll routes | End-to-end order-to-cash and procure-to-pay staging tests | Ensure canonical posting functions and no bypass writes |
| WS3 Integrations | in progress | TallyBridge, biometric-sync, communications/WhatsApp, GST/banking and shipping foundations | Connector contract tests, retry/health/idempotency/reconciliation | Credentials/sandbox access must be owner-controlled |
| WS4 AI platform | in progress | AI assistant/retrieval, Document AI, agent router, audit, forecast and governance migrations | One governed runner with allow-listed tools, budgets, approvals, undo and eval gate | Exact Section 13 prompts/tools must be imported from full report |
| WS5 Analytics/models | in progress | Dashboards/reports, accounting and stock views, MRP/forecast utilities | KPI source lineage, validated forecast/optimizer/scenario outputs | Must use deterministic tool results for numbers |
| WS6 Agents | in progress | Partial assistant, document, brief, proposal and agent-router foundations | Implement Section 13 agents in blueprint order with evaluations | Need full prompt/tool specification from source |
| WS7 Interfaces | in progress | Responsive routes, vendor portal, public ecommerce, shop-floor, PWA tests | Four-language coverage, offline E2E, role-specific field/store/driver/employee/dealer screens | Full screen-by-screen spec not fully transcribed here |
| WS8 Governance/hardening | in progress | Security register, coverage inventory, cutover/readiness docs, CI/security tests | Live DB audit, penetration/red-team, restore/load/privacy drills, business sign-off | Cannot certify without live DB and staging environment |

## Dependency order (Section 14.6)
1. WS0 platform foundation.
2. WS1 master data and migration.
3. WS2 transaction engines.
4. WS3 integrations and WS4 AI platform once foundational contracts are stable (mock/sandbox only).
5. WS5 analytics/models.
6. WS6 agents: platform agents → data-reading analysts → drafting agents → bounded acting agents.
7. WS7 interfaces.
8. WS8 hardening and owner acceptance, with security and tests continuous throughout.

## Decisions / assumptions
- Preserve existing code and patterns; no rewrite.
- Supabase CLI migrations are authoritative for deployment; validate Drizzle against them and do not allow a parallel schema authority.
- Keep live integrations mocked/sandboxed until authorized.
- All agents start at L0/L1 and cannot perform money movement, price changes, hiring decisions or statutory filings without human approval.
- No destructive migration or production deployment by the coding agent.
- `docs/blueprint-full.md` is authoritative; `docs/blueprint.md` is navigation only.

## Change log
- 2026-10-19: Created audit baseline and WS0–WS8 tracker on `feature/audit-blueprint-baseline`; PR #124 subsequently merged. Source-level only. No application code or database changed.
- 2026-10-19: Owner confirmed Step 0 decisions. Read-only Supabase discovery found the available linked accounts both expose ref ibnacjirwnhbtqrirdsz, not the configured/documented production ref ysaocrumxikgywdotkne; exact PDF remains blocked on binary-capable Git upload.


## Owner decisions and remaining Step 0 gates — 2026-10-19

- [x] Baseline confirmed: `main` SHA `e4658ea188b76095903e133df7b5669affb68a46`; other PRs are reviewed separately.
- [x] Supabase CLI migrations are authoritative; Drizzle must be checked for parity.
- [x] Original PDF checksum retained as reference only; no PDF repository copy is required.
- [ ] **Supabase blocker:** both currently available connector links list `ibnacjirwnhbtqrirdsz`, but repo config names `ysaocrumxikgywdotkne`. Reauthorize the correct account/project before live audit.
- [ ] **PDF blocker:** current GitHub file-writing action supports UTF-8 text only, not binary PDF upload. Commit via a binary-capable Git workflow and verify exact bytes.
- [ ] Review other open PRs separately; this does not authorize merging them.
- **No application code, migrations, production data writes, or deployments** until blockers are resolved and the owner approves the next phase.


## Source-only schema/security audit — 2026-10-19

- [x] Enumerated 117 SQL files under `supabase/migrations/` at confirmed baseline and reviewed the generated Supabase type table index (156 table-like declarations) against blueprint Sections 11.1–11.16 and 13.
- [x] Added source-only RLS/company-separation, audit logging, approval-handling and Section 11 domain inventory findings to `docs/AUDIT.md`.
- [x] Compared the 21 AI platform table families specified in Section 11.15 with source declarations and documented exists/partial/missing equivalents and Section 13 runtime gaps.
- [ ] Build and validate the definitive one-row-per-table migration-derived matrix for every table: RLS/policies/grants, company/branch scope, approval predicate, audit triggers/columns, soft delete/status history, child references and tests. Current findings are a source-level coverage assessment, not a completed runtime security certification.
- [ ] **Live database remains entirely UNVERIFIED:** the Supabase connector project reference mismatch remains unresolved. No live catalog, applied migration ledger, storage, Realtime, grants or policy state was inspected in this task.
- [x] No PDF repository upload required.
- [ ] Review other open PRs separately. No further merge or deployment is authorized by the current source-only task.

### Source findings to carry forward

- Supabase CLI migration source is the intended schema authority; Drizzle must be checked for parity.
- Company-scope policies are applied through several explicit/dynamic allowlists. Approval hardening is a separate restrictive layer in source; some HR/AI tables are deliberately locked from browser/API roles until purpose-built policies exist.
- Universal audit/status-history coverage is not demonstrated. Central blueprint-named `approval_rules` / `approval_requests` are not evidenced as tables.
- AI foundations exist, but the complete Section 11.15 registry/run/step/action/feedback/memory/evaluation/budget/gateway/anomaly schema and Section 13 governed runtime are incomplete or not evidenced.
- Every claim about live tables, RLS, grants, storage, Realtime, migration application or production behavior is **UNVERIFIED** until the correct Supabase project is authorized and read-only catalog checks are performed.

**Guardrail:** source/docs only. No application code, migration execution, database changes, production writes, additional PR merges or deployments.


## Post-merge continuation — 2026-10-19

- [x] Confirmed PR #124 is merged; merge commit `a9c0ea39932ce22e3384b6e86046f7bb9b557370` is now `main`.
- [x] Advanced the existing `feature/audit-blueprint-baseline` branch to that same `main` commit for continued documentation work.
- [ ] Continue the definitive migration-derived table matrix. Previous schema review was a selected-source assessment, not a literal inspection of every SQL statement in all 117 migration files.
- [ ] Keep live Supabase schema/RLS/grants/storage/Realtime/applied migration state UNVERIFIED until the correct project is authorized and read-only verification succeeds.
- [x] PDF requirement removed.


## Blueprint authority and latest source-only work — 2026-10-19

**Mandatory rule before every task:** read the relevant sections of `docs/blueprint-full.md` directly before planning or implementing that task. Do not use `docs/blueprint.md`, an audit summary, or any paraphrase as the source of requirements. `docs/blueprint.md` is navigation only. the original PDF is retained only as a checksum reference in `docs/AUDIT.md`.

- [x] Added `docs/blueprint-full.md` from the attached Markdown via the file retrieval connector.
- [ ] Exact-byte verification is NOT passed: attached file SHA-256 is `93e3bd78362882a7e0bc3e49977d104c78a7f06aedf8e623267a3711f325a04c` (137,124 characters). The committed text fetched back from GitHub is 137,122 characters. Therefore checksum equality is unverified and the file must not be treated as verbatim yet. The retrieval connector returned two fewer characters than the local attachment; exact location has not been isolated. Correct by byte-preserving upload and compare SHA-256 before claiming success.
- [x] Recorded PDF checksum from the uploaded 69-page original: `ea9d33339005a1622a455c4ee757fb39fa15714b40c35a5be5c6181d4c227937` (2,547,569 bytes). The original PDF is not stored in the repository; its checksum is retained in `docs/AUDIT.md` for reference only.
- [x] Updated `docs/blueprint.md` to designate `docs/blueprint-full.md` as authoritative text, the original PDF is retained only as a checksum reference in `docs/AUDIT.md`.
- [x] Added draft `docs/SECURITY_MATRIX.md`; it explicitly warns that it is incomplete and contains an outstanding grouped row. Do not call the requested one-row-per-every-table matrix complete yet.
- [x] Added `docs/MIGRATION_PLAN.md` for Supabase CLI authority, Drizzle/phase-folder inventory and proposed consolidation; no migration files changed.
- [x] Added `docs/WS0_GAP_PLAN.md` as an additive-only approval/audit/status/number-series design and staging test plan; no migrations created.
- [ ] Finish exhaustive migration-by-migration table and policy/trigger/grant inventory, split every grouped row and attach evidence.
- [ ] Verify source markdown exactly (character count and SHA-256) after a byte-preserving Git workflow. Current committed file differs in reported character count, so do not claim complete.
- [ ] Live database remains **UNVERIFIED**; no database access was performed.
- [ ] No application code, existing migration, database, production data, or deployment was changed. Nothing was merged.


## Baseline before documentation PR review

- `main` baseline recorded before any further merge: `a9c0ea39932ce22e3384b6e86046f7bb9b557370`.
- Original source PDF checksum (reference only; not stored in repository): SHA-256 `ea9d33339005a1622a455c4ee757fb39fa15714b40c35a5be5c6181d4c227937` (2,547,569 bytes).
- `docs/blueprint-full.md` is authoritative. Live Supabase database remains **UNVERIFIED**. No database access, migrations, app code changes, or deployment are authorized by this source-only documentation work.
