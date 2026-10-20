# Tally RAR/Backup Import Architecture

Status: implementation foundation in progress; archive inspection is not a completed ERP import.

## Objective

Let an authorized ERP administrator submit one or more company-specific .rar archives and move the source through a controlled pipeline that preserves the original bytes, identifies the Tally data format, validates completeness, reconciles accounting/inventory controls, and only then stages data for the correct ERP company.

The existing project remains the only ERP project. This work extends the current Tally import page and the existing tally-bridge/ local read-only connector. It does not require Lovable credits or a new Lovable project.

## Critical format rule

RAR is only a container. It can contain:
- Tally XML exports, which can be parsed by the existing streaming Tally import pipeline after strict validation.
- Native Tally backup/data files, whose binary layout is version-dependent and is not a supported general-purpose XML format.
- A mix of exports, native data, backup metadata and unrelated files.

The importer must never label arbitrary binary data as "read by Tally". For a native backup, the supported path is: safely extract into quarantine → restore/open with the compatible licensed Tally release in an isolated local environment → use the existing read-only TallyBridge HTTP/XML exporter to create company-qualified XML snapshots → validate snapshot manifests and source totals → upload chunks to isolated staging. TallyBridge must not write back to Tally.

## Pipeline

1. **Intake** — authenticated Admin only. Accept multiple archives with a source company label (not yet trusted as identity), original filename, byte count and SHA-256. Store originals in a private quarantine location; do not place them in public storage or a web root.
2. **Archive safety inspection** — list archive entries before extraction; reject absolute paths, parent traversal, links, excessive entry count or expanded size, corrupt archives and unsupported types. Extract into an isolated temporary directory with strict limits and remove it after processing according to retention policy.
3. **Format classification** — classify XML exports separately from likely native-data files and unknown files. File extensions are hints only. Preserve a manifest of every file, hash, size, path and classification.
4. **Company identity** — derive identity from Tally company metadata/GUID in verified XML or from the actual restored company as returned by TallyBridge. Never infer a destination from the archive filename, top-level folder, company display name alone, or current ERP company.
5. **Read/normalize** — XML uses the existing bounded streaming parser and documented import-only normalization. Preserve original bytes and raw record XML. Native data goes through Tally restore + read-only bridge, not a custom speculative binary decoder.
6. **Validation** — require a complete masters inventory and voucher history for the requested date range; preserve GUID/REMOTEID, ALTERID, MASTERID, UDF/custom fields, inventory lines, bill allocations, units, godowns, cost centres, cancellation/deletion/optional lifecycle, opening values and source date coverage. Duplicate or missing source identity is quarantined, not resolved by fuzzy name matching.
7. **Reconciliation** — compare source voucher counts and debit/credit controls, party/bill-wise balances, inventory quantities and values, opening stock rates/values, and date-range coverage. Decimal amounts use exact minor-unit/decimal arithmetic. Report unresolved differences; do not auto-correct them.
8. **Staging** — use a dedicated, company-scoped staging boundary. Each run is keyed by source company GUID + archive/snapshot hash + import schema version. Chunks have sequence numbers and hashes; retries are idempotent; a run cannot become validated until every chunk and final checksum/count has been accepted.
9. **Commit** — explicit Admin/Accountant approval after reconciliation; transactional company-scoped commit, audit log and verified rollback/recovery plan. A source company's data must never be silently routed into a different company or a management book.

## Proposed states

uploaded → quarantined → inspected → awaiting_tally_restore | ready_for_validation → validating → blocked | validated → approved_for_staging → staging → staged → reconciled → approved_to_commit → committed

Any corrupt, incomplete, ambiguous or unauthorized run remains blocked or quarantined; it is never auto-committed. A retry resumes only from verified chunk/checksum boundaries.

## Security and operational requirements

- Admin-only UI and server-side authorization; frontend visibility is not an authorization boundary.
- Private storage with RLS enforcing approved Admin and explicit import permission, not merely owner-folder access.
- No service-role key in browser code. No archive contents in application logs or analytics.
- Virus/malware scan where supported, archive bomb limits, path traversal and symlink defenses, MIME/content sniffing, file count/expanded size limits, retention/deletion controls.
- Keep each company and source archive isolated. ESTIMATE and ABZ - EST are not interchangeable with official operational companies or management books.
- No direct writes to Tally, no writes to accounting tables during inspection, and no live payment integration involvement.
- Keep original archive hash and raw evidence immutable. Normalized derivatives are separately versioned and auditable.
- Large archives must be processed via disk-streaming/local worker, not by loading the entire archive/XML into browser memory or a serverless request body.

## Current implementation foundation

- tally-bridge/src/archive-intake.ts introduces 7-Zip-backed archive listing/extraction, path and expansion checks, and classification. It is only an intake/inspection primitive.
- tally-bridge/src/archive-intake.test.ts covers basic listing parsing, traversal rejection, resource limits, and format classification.
- Existing src/lib/tally-bulk.ts remains the XML streaming/normalization layer; existing migration staging stays separate.
- Existing /tally-import and /local-tally-accounts currently support XML/snapshot preparation. Direct RAR upload to the authenticated ERP, private durable quarantine storage, resumable cloud chunk transport, native backup restore automation, and transactional multi-company commit are not yet implemented by this change.

## Acceptance criteria before real import

1. Test with representative archives from every source company and Tally version; include corrupt archive, password-protected archive, traversal names, oversized expansion, duplicate files and mixed-format archives.
2. Demonstrate company GUID mapping and complete masters/voucher date coverage from actual source data.
3. Run against a disposable database with role/company adversarial tests; prove no cross-company read/write and no data mutation during preview.
4. Verify source vs ERP control totals with accounting review, including bill-wise settlements and stock opening rates/values.
5. Prove resumable chunk transfer, idempotent retry, duplicate-run detection, audit evidence, and rollback from a disposable test.
6. Identify and verify the actual deployed Supabase project/schema before applying any migrations. No migration or production import is authorized by this design document alone.
7. Keep the importer in preview/staging-only mode until every gate passes.
