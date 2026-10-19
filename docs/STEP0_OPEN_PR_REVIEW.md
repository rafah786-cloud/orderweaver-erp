# Step 0 — Open Pull Request Triage

**Date:** 2026-10-19  
**Baseline:** `main` at `e4658ea188b76095903e133df7b5669affb68a46`  
**Purpose:** Triage the currently open PRs independently of the blueprint audit. This is a source/diff-level screening, not approval to merge or deploy. No PR was merged, rebased, closed, or otherwise changed during this review.

## Findings

| PR | Scope observed in diff | Step 0 assessment | Required gate before any merge |
|---|---|---|---|
| [#124](https://github.com/rafah786-cloud/orderweaver-erp/pull/124) | Blueprint index, audit and build-state docs | Keep as the Step 0 documentation branch. It now records owner decisions and the two remaining blockers. | Recheck document accuracy after Supabase access is restored and the PDF is committed. |
| [#123](https://github.com/rafah786-cloud/orderweaver-erp/pull/123) | Read-only archive inspection/intake primitives and tests in `tally-bridge`; architecture docs | Potentially useful, narrow archive-intake foundation. It explicitly distinguishes XML exports from native Tally backups. | CI and representative archive tests; verify path traversal, symlink, decompression limits, cleanup and checksum behavior. Do not claim it imports native Tally data. |
| [#122](https://github.com/rafah786-cloud/orderweaver-erp/pull/122) | Restrictive finance-role RLS migration, isolated PostgreSQL adversarial test and CI job | Security-relevant; do not merge solely because the intent is restrictive. It touches live-data authorization semantics. | CI must pass; verify actual target tables/columns and interaction with existing permissive/restrictive policies, approved-profile state, roles, and company A/B isolation. No live migration until the intended Supabase project and recovery gate are verified. |
| [#118](https://github.com/rafah786-cloud/orderweaver-erp/pull/118) | Large combined PWA, offline shell, shop-floor, shipments, quality, maintenance and Smart SleepTec workspace changes | Broad scope and stale base relative to the confirmed baseline; too much to accept as one undifferentiated release. | Rebase/compare against confirmed main in a separate review; split or clearly gate concerns; pass full CI and route/RLS/workflow regression tests. Verify offline fallback never caches private ERP data. |
| [#102](https://github.com/rafah786-cloud/orderweaver-erp/pull/102) | Razorpay test-mode create-order/verify-signature endpoints and checkout test UI | Explicitly sandbox-only; must not be treated as live ecommerce/payment readiness. | CI; verify fixed server-side amount, live-key rejection, signature verification and no paid-order/ERP mutation. Review secret-handling and confirm no credentials in tracked files/history. Keep live checkout disabled. |
| [#95](https://github.com/rafah786-cloud/orderweaver-erp/pull/95) | Removes one unused state variable from `src/routes/shop.tsx` | Tiny cleanup, but branch is old and may now be obsolete or conflict with later shop work. | Compare with current main and run lint/tests; close as superseded if the unused state is already absent. |
| [#90](https://github.com/rafah786-cloud/orderweaver-erp/pull/90) | Additional full-app audit documentation | Documentation may overlap with newer audit/coverage records and should not become a competing source of truth. | Compare its claims and dates against current main and `docs/AUDIT.md`; merge only if it adds non-duplicative, still-correct evidence. |
| [#40](https://github.com/rafah786-cloud/orderweaver-erp/pull/40) | TallyBridge snapshot bundle to migration-staging pipeline, source checksum validation and staging changes | Overlaps functionally with current Tally import/staging code and #123's archive work; likely needs integration review rather than independent acceptance. | Reconcile interfaces with current main and #123; test idempotency, source company isolation, cancelled/deleted/optional vouchers, totals, duplicate identifiers, rollback and staging-only behavior. No production import. |
| [#37](https://github.com/rafah786-cloud/orderweaver-erp/pull/37) | Sales-order requests/label printing/print bridge, permissions and migrations, plus Velocity-related files | PR title and actual changed-file scope do not align cleanly; broad, old-base branch with multiple domains. | Reconcile title/intent and inspect every migration/function; test authorization, claim/ack idempotency, label output and company boundaries; rebase against current main and pass CI before considering merge. |
| [#35](https://github.com/rafah786-cloud/orderweaver-erp/pull/35) | Private Tally archive uploader, storage bucket and upload registry migrations | Overlaps with #123's archive-intake direction and has database/storage security implications. | Review private bucket access, file size/type validation, tenant/company authorization, registry tamper resistance, retention/deletion and migration parity. Integrate with #123/#40 rather than creating parallel archive pipelines. |

## CI evidence limitation

The GitHub combined-status query returned no status entries for the inspected PR head SHAs. That means this audit did **not** establish that CI passed; it is not evidence that tests are passing. Confirm current Actions runs directly on each candidate branch before merge.

## Cross-PR recommendations

1. Do not merge PRs as part of Step 0.
2. Resolve the Supabase project mismatch first; otherwise database-policy and migration claims cannot be checked against the correct live deployment.
3. Establish one Tally archive/staging architecture across #35, #40 and #123 instead of accepting overlapping implementations independently.
4. Review broad/stale branches (#118, #37, and #102) against the confirmed baseline before considering them.
5. Keep all payment and accounting side effects disabled until the relevant end-to-end tests, live schema verification, backup/recovery gate and owner approval are documented.

## Status

This triage is a preliminary source/diff review only. It does not approve any PR for merge. No application code, live database, migration state, production data, or deployment was changed.
