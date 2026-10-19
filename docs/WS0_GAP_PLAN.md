# WS0 Gap Plan — Draft Only

> No code, migration or database changes are included. **LIVE DATABASE: UNVERIFIED.** Proposed filenames are placeholders; select timestamp prefixes only after a full inventory and staging replay.

## Existing items to reuse

- Identity/company boundary: `profiles`, `user_roles`, `companies`, `user_company_access`.
- Specialized audit sinks: `voucher_audit_log`, `erp_domain_audit_log`, `ai_audit_log` (exact coverage unknown; a sink is not a universal trigger).
- Existing numbering: `voucher_number_series`; preserve its financial-year and concurrency semantics.
- AI proposal flow: `ai_action_proposals`; this is not a committed action ledger.
- Existing domain approval/transition guards: finance, vendor, ECO, final QC, CAPA and maintenance flows. Central approval must authorize an action but must not replace domain invariants or duplicate each domain state machine.

## Proposed additive migration files

| Proposed file | Purpose | Main risk / mitigation |
|---|---|---|
| `YYYYMMDDHHMM00_ws0_approval_core.sql` | Add `approval_rules` and `approval_requests`, company/action/entity/requester/approver, amount/currency, status, expiry, idempotency and indexes. | Ambiguous rules; no matching rule must deny, overlapping rules need deterministic precedence. |
| `YYYYMMDDHHMM01_ws0_approval_security.sql` | RLS, company/approved-profile boundaries, narrow request/decision RPCs, deny direct decision-field edits. | Self-approval, cross-company approvals, unsafe function grants; least-privilege tests. |
| `YYYYMMDDHHMM02_ws0_audit_core.sql` | Reconcile existing audit sinks and define append-only canonical event schema. | PII/secrets in snapshots; redact sensitive fields and restrict reads. |
| `YYYYMMDDHHMM03_ws0_audit_triggers.sql` | Generic audit helper plus explicit per-table trigger allowlist. | Tables lack `id` or `company_id`; heterogeneous/composite keys; recursion and write overhead. Use table-specific key mapping and test before attaching broadly. |
| `YYYYMMDDHHMM04_ws0_status_history.sql` | Add status history with entity, company, from/to, actor, reason, timestamp and correlation/approval reference; attach only to reviewed status tables. | Polymorphic references and duplicate domain histories; use per-domain integrity where possible. |
| `YYYYMMDDHHMM05_ws0_number_series.sql` | Generic company/document/FY numbering only for families not safely served by `voucher_number_series`; atomic RPC and uniqueness constraints. | Duplicate numbers and concurrency; do not promise gapless numbering or convert existing accounting series blindly. |

These are planning names only; no files or migrations were created. Never edit/delete already existing migration history.

## Rules to prevent duplicate approval systems

1. Central rules describe who may approve an action and under which thresholds; a request records the decision workflow and links to the domain record and optionally `ai_action_proposals`.
2. The existing domain RPC must revalidate current state, company, totals, credit, stock and other invariants at execution time.
3. Requester cannot approve their own high-risk action. Money leaving the company, price changes, write-offs, hiring/firing and statutory filing remain human-approved.
4. Map existing `approved_by`/status fields only where the source history is reliable. Otherwise preserve existing records and link new requests forward-only.
5. Audit events must not be editable by ordinary users/agents. Never trust user-controlled actor metadata as sole proof of identity. Redact bank, payroll, statutory IDs, credentials and tokens.

## Rollback and staging test plan

- Use a separate disposable Supabase staging project, no production data or secrets. Replay the Supabase CLI migration chain from zero and record the ledger before testing.
- Prefer additive changes. If a test fails, stop and restore the disposable project or use a reviewed compensating migration; do not assume destructive rollback is safe.
- Seed two companies and multiple branches, with admin, manager, accountant, sales, production, HR, vendor and unapproved users.
- Test no/overlapping rules, threshold edges, expiry, multi-step approvals, self-approval, wrong company/branch, revoked access, concurrent decisions, retries and stale entity versions.
- Test direct table/RPC bypass, existing domain guards, audit insert/update/delete and rollback behavior, spoofed actor, sensitive-field redaction, status-history atomicity, and concurrent number generation across company/FY.
- Run CI and adversarial tests; attach schema diff, migration ledger and test logs. No live deployment without separate owner approval.
