# Build State — AI-Assisted Business Management Environment

> **LIVE-DATABASE STATUS: UNVERIFIED.** Source-only review only. No live schema, RLS, grants, storage, Realtime, migration ledger or production behavior was verified in this task.

**Last updated:** 2026-10-19  
**Task 2 base reference:** latest `main` observed at `402c0d65365c4ddf9218c3bfacd295bc090fb10e`; PR #125 merge commit `867c0778c0ecb2b7ae66d9cc4898053cd0fb9888`.  
**Current task:** WS0 additive approval/audit foundation, local-only CI, no hosted database or deployment.

## Current gate
- [x] Read supplied blueprint structure and dependency workstreams WS0–WS8.
- [x] Inventory repository structure, stack/package scripts, route list, migration tracks, tests, docs and environment-variable names (no values).
- [x] Create source-level audit and mapping.
- [ ] Verify actual ERP production schema, policies, functions, storage and deployed migration state — blocker: both available Supabase links expose ref ibnacjirwnhbtqrirdsz, while repo config/documentation identifies ysaocrumxikgywdotkne. Read-only inspection of the former found seven migration records and only public.tally_archive_uploads; do not treat it as production.
- [x] Owner decisions received; the original source checksum is retained for reference only. The live Supabase project identity remains unresolved.
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
- 2026-10-19: Owner confirmed Step 0 decisions. Read-only Supabase discovery found the available linked accounts both expose ref ibnacjirwnhbtqrirdsz, not the configured/documented production ref ysaocrumxikgywdotkne; the blueprint Markdown is now byte-for-byte verified.


## Owner decisions and remaining Step 0 gates — 2026-10-19

- [x] Baseline confirmed: `main` SHA `e4658ea188b76095903e133df7b5669affb68a46`; other PRs are reviewed separately.
- [x] Supabase CLI migrations are authoritative; Drizzle must be checked for parity.
- [x] Original PDF checksum retained as reference only; no PDF repository copy is required.
- [ ] **Supabase blocker:** both currently available connector links list `ibnacjirwnhbtqrirdsz`, but repo config names `ysaocrumxikgywdotkne`. Reauthorize the correct account/project before live audit.
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

**Mandatory rule before every task:** read the relevant sections of `docs/blueprint-full.md` directly before planning or implementing that task. Do not use `docs/blueprint.md`, an audit summary, or a paraphrase as the source of requirements. `docs/blueprint.md` is navigation only.

- [x] `docs/blueprint-full.md` is byte-for-byte verified against the attached Markdown.
- [x] Original attachment: 137,124 bytes; SHA-256 `93e3bd78362882a7e0bc3e49977d104c78a7f06aedf8e623267a3711f325a04c`. GitHub blob SHA-1 after repair: `8603ca3271ee9114665e85d12b98f290287b8bcb`, equal to the Git blob SHA-1 computed from the original bytes.
- [x] Located and repaired exactly two omitted newline characters: the newline between lines 1000–1001 in the Section 13.4 JSON example and the final newline at EOF. All 144 heading-delimited sections were compared; zero mismatches.
- [x] Original PDF checksum retained as a reference only: SHA-256 `ea9d33339005a1622a455c4ee757fb39fa15714b40c35a5be5c6181d4c227937` (2,547,569 bytes). The PDF is not stored in this repository and no upload is required.
- [x] `docs/SECURITY_MATRIX.md` has one row per 170 table names inventoried across the migration-like SQL sources and no grouped catch-all row. Unverified fields are marked unknown; manual review of effective policies, dynamic SQL, grants, audit and approval enforcement remains an explicit follow-up.
- [x] Added `docs/tools/migration_security_matrix.py`, a read-only source inventory script; no application source or SQL migration was edited.
- [x] `docs/MIGRATION_PLAN.md` documents the approved Supabase CLI migration authority. `docs/WS0_GAP_PLAN.md` remains planning only.
- [ ] CI for PR #125 must complete successfully before merge.
- [ ] Live database remains **UNVERIFIED**; no database access was performed.
- [x] No application code, existing migration, database, production data or deployment was changed. No merge has occurred during this review.


## Baseline before documentation PR review

- `main` baseline recorded before any further merge: `a9c0ea39932ce22e3384b6e86046f7bb9b557370`.
- Original source PDF checksum (reference only; not stored in repository): SHA-256 `ea9d33339005a1622a455c4ee757fb39fa15714b40c35a5be5c6181d4c227937` (2,547,569 bytes).
- `docs/blueprint-full.md` is authoritative. Live Supabase database remains **UNVERIFIED**. No database access, migrations, app code changes, or deployment are authorized by this source-only documentation work.


## Task 2 — WS0 additive approval/audit foundation — 2026-10-19

- [x] PR #125 was verified to change only files under `docs/`; its ERP CI workflow completed successfully. Merged by the owner-authorized assistant action as commit `867c0778c0ecb2b7ae66d9cc4898053cd0fb9888`. PR #124 was already merged at `a9c0ea39932ce22e3384b6e86046f7bb9b557370`.
- [x] Created branch `feature/ws0-approval-audit-foundation` from the post-PR #125 main commit `867c0778c0ecb2b7ae66d9cc4898053cd0fb9888`.
- [x] Read blueprint sections 11 and 13 and `docs/WS0_GAP_PLAN.md` before preparing Task 2.
- [ ] Add six forward-only migrations and six non-destructive compensating scripts under `supabase/rollback/`; use timestamps later than the newest existing CLI migration `20261018210000_ai_marketing_creative_studio.sql`.
- [ ] Add isolated local-Supabase CI: replay current main migrations in a separate baseline job; replay all migrations including WS0 in the test job; run security/approval/audit/status/numbering tests; retain logs and schema diff as artifacts.
- [ ] Open PR for Task 2 only after source checks are complete. Do not merge until all local CI tests pass and the owner separately approves in chat.
- **No hosted/live Supabase access, migration application, or deployment is permitted. Live database status remains UNVERIFIED.**


## Task 2 — WS0 additive foundation (2026-10-19)

- PR #125 is already merged at `867c0778c0ecb2b7ae66d9cc4898053cd0fb9888`. Its ERP CI run was observed pending with zero jobs; the workflow has a plain `pull_request` trigger and no path filters. No branch-protection/ruleset required checks were returned. A later unrelated main commit `402c0d65365c4ddf9218c3bfacd295bc090fb10e` is not part of this Task 2 work.
- Task branch: `feature/ws0-approval-audit-foundation`. It already existed with an initial six-migration draft and non-destructive compensating scripts; this pass is auditing and correcting that draft, not creating duplicate files.
- Authoritative blueprint sections read before this task: Sections 11.1–11.16 (database conventions, governance, key functions), 13.1–13.3 (agent approval gating), and 14.1–14.10 (database patterns, WS0 exit criteria and testing).
- Newest existing authoritative migration before WS0: `20261018210000_ai_marketing_creative_studio.sql`. WS0 migration timestamps `20261019100000` through `20261019100500` are later.
- Initial source review found a malformed/duplicated approval-security migration and an audit guard that could suppress updates to non-WS0 audit rows. The approval-security migration has been replaced with a single clean transaction; the audit guard now preserves existing non-WS0 update/delete behavior.
- Still required: correct branch/role/RLS gaps; add SQL assertions and concurrent numbering tests; add a local Supabase CLI/Docker workflow that separately reports baseline replay failures, WS0 application failures and test failures; upload logs and schema diffs as artifacts; verify CI before opening/finishing the PR.
- Strict scope: new WS0 functions and objects only. No existing domain workflows are wired into approvals/status history/numbering. No existing migrations are edited, no live or hosted database is accessed, and no deployment is authorized. Live database remains **UNVERIFIED**.


## Task 2 implementation and local test gate — 2026-10-19

- [x] Confirmed PR #125 is already merged at `867c0778c0ecb2b7ae66d9cc4898053cd0fb9888`. The ERP CI run previously appeared pending with zero jobs; the workflow uses a plain `pull_request` trigger without path filters. The GitHub rulesets endpoint returned no rulesets, and no required status checks were reported by the connected status API.
- [x] Task branch: `feature/ws0-approval-audit-foundation`. The branch existed with a draft of the six new migrations and compensating scripts; it is being audited and corrected rather than duplicated.
- [x] Read the relevant authoritative blueprint sections directly: 11.1–11.16, 13.1–13.3 and 14.1–14.10.
- [x] Newest pre-WS0 authoritative migration: `20261018210000_ai_marketing_creative_studio.sql`. New WS0 timestamps: `20261019100000` through `20261019100500`.
- [x] Corrected the malformed/duplicated approval-security migration and the audit guard so non-WS0 audit updates retain their prior behavior.
- [x] Added SQL assertions covering company RLS, fail-closed branch scope, thresholds, missing/overlapping rules, self-approval, direct DML denial, cross-company decision denial, audit append-only/redaction, and transaction rollback of status history.
- [x] Added a parallel psql concurrency test for the new number allocator.
- [x] Added a local Supabase CLI/Docker workflow and runner. It removes the six WS0 migration files temporarily to replay the 117-file baseline first, then restores and applies the six WS0 migrations, runs tests, and saves migration ledgers, schema snapshots/diffs and logs as CI artifacts.
- [ ] CI has not yet verified baseline replay, WS0 application or tests. Report baseline migration failures separately and do not repair existing migrations without approval.
- [ ] Do not merge the Task 2 PR until local CI passes and the owner separately approves in chat.
- **Safety:** no hosted/live Supabase database was accessed; no migrations were applied to a hosted database; no deployment occurred. Live database remains **UNVERIFIED**. Existing application flows are not wired to the new approval/status/numbering foundation.
