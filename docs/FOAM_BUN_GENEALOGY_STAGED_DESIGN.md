# Foam-bun genealogy and curing quarantine — staged design

**Status: staged only. Not applied to the live database; not yet wired into production consumption.**

## Included in this phase

- manufacturing-phase1/001_foam_bun_genealogy_quarantine.sql proposes additive foam_bun_lots and foam_bun_lineage tables, company-scoped RLS, explicit cure start/minimum hours/release timestamp, and parent-child lineage.
- The prepared SQL rejects release before the cure boundary, lineage across companies, self-links, cycles, unit mismatches, and lineage from a parent that is not released and cured.
- src/lib/foam-bun-curing.ts provides deterministic domain guards for curing windows, active-company consumption checks, and lineage validation. Tests cover the time boundary, quarantine, malformed values, company separation, and cycles.
- No UI was added because the live schema has not been activated. No production records or stock ledger rows were changed.

## Mandatory activation work before this can be called production-ready

1. Review the migration against the exact live schema and approved backup/recovery procedure.
2. Extend the canonical production-consumption posting function to require a bun-lot ID for configured foam stock items, call the cure guard, and write the lot reference to each stock issue.
3. Add remaining-quantity checks using the authoritative movement ledger and atomic locking to prevent concurrent over-issue; model slab/remnant yield and explicit scrap separately.
4. Ensure release/rejection/quarantine transitions are auditable and that released/consumed lot identity cannot be silently rewritten.
5. Add isolated PostgreSQL integration tests against the actual intended functions and RLS/grants, including concurrent issues, reversal, company boundaries, and historical lot traceability.
6. Apply only through the existing approved migration workflow, then regenerate database types, integrate UI, and run a production smoke test.

Until those steps are complete, existing production issue paths can still bypass the staged lot schema. Do not use the staged schema as proof that foam consumption is currently quarantined.
