# Migration Authority and Consolidation Plan

> **LIVE DATABASE: UNVERIFIED.** This is a source-only proposal. Do not execute, rename, delete, squash or rewrite migrations as part of this plan.

## Inventory

- `supabase/migrations/`: 117 SQL files at the audited main baseline. Owner confirmed Supabase CLI migrations are authoritative.
- `drizzle/migrations/`: a second migration directory exists and must be treated as a possible competing history until each file is inventoried and compared.
- `drizzle/schema.ts`: previously observed blank/auto-generated; it is not currently reliable evidence of the full schema.
- Generated Supabase declarations at `src/integrations/supabase/types.ts` contain about 156 table-like declarations in the reviewed snapshot. They can be stale and are not proof of deployed state.
- `accounting-phase1/`, `accounting-phase2/`, `accounting-phase3/`, `manufacturing-phase1/`, and `security-tests/` are additional schema/test artifacts that must be classified as executable migrations, historical proposals, fixtures or tests. Do not execute by directory name alone.

## Risks and conflicts to resolve

1. Duplicate or overlapping definitions may exist across Supabase CLI migrations, Drizzle migrations and phase folders.
2. Migration order matters: later migrations replace policies, revoke grants, add restrictive predicates and harden RPCs. A simplistic table-name comparison can miss the final effective control.
3. Dynamic SQL and allowlists can change multiple tables without one explicit statement per table.
4. Generated types can lag migrations or reflect a different Supabase project.
5. Applying historical phase SQL after the CLI chain could duplicate objects or weaken security.
6. The intended live project reference is not yet confirmed; all live catalog and migration-ledger claims remain UNVERIFIED.

## Proposed consolidation under Supabase CLI

1. Freeze schema changes during inventory. Do not alter/delete current migration files.
2. Generate a manifest for every file in all migration-like directories: path, checksum, timestamp/order, object names, dependencies, and classification.
3. Parse each Supabase migration for CREATE/ALTER/DROP TABLE, RLS, policies, grants/revokes, functions, triggers, storage policies, publication/realtime and extension changes. Capture dynamic SQL for manual review.
4. Compare Drizzle and phase-folder SQL to the ordered Supabase CLI history. Record exact duplicate, equivalent, conflicting and unreferenced statements in a separate comparison report.
5. Treat `supabase/migrations/` as the sole forward migration authority. Drizzle, if retained, becomes schema/type metadata only unless the owner explicitly approves a separate, synchronized role. Do not run Drizzle migrations against the same database.
6. Where a schema representation is needed, regenerate or reconcile Drizzle schema from the approved CLI baseline and document unsupported objects; never use it to silently rewrite historical migrations.
7. Build a fresh disposable staging Supabase project from the CLI chain. Check migration status, schema diff, RLS/grants/triggers/functions, storage, realtime and application tests. Do not connect production secrets or real customer data.
8. Resolve differences with new additive, forward-only Supabase CLI migrations. Never rewrite already-applied history. Any destructive cleanup requires a separate reviewed proposal and owner approval.
9. Validate restore and rollback strategy. For DDL that cannot be transactionally reversed, document compensating migration/restore steps rather than promising a universal down migration.
10. Only after owner approval, stage and test the plan in the correct project. No deployment is authorized by this document.

## Acceptance evidence

- Complete manifest of every migration-like file and SHA-256.
- Duplicate/conflict report with file and statement references.
- Fresh-staging migration replay and schema diff.
- Automated policy/grant adversarial tests and CI results.
- Explicit owner approval before any live database action.
