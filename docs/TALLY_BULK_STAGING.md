# Four-company Tally bulk staging — local preparation, activation blocked

## Implemented path

Both `/tally-import` and `/local-tally-accounts` expose **Select XML export** and **Select snapshot folder**. A single XML file up to 256 MB can now be streamed into local per-company evidence chunks without four manifests. Its `SVCURRENTCOMPANY` header must identify an allowed source; a generated local manifest records the original hash, not verified TallyBridge provenance. The supplied ESTIMATE Master.xml is accepted for local preparation only. A 165 MB ZIP archive **cannot be ingested directly**: extract it first. A 165 MB XML is within the size limit, but processing remains dependent on browser memory and per-message limits; no cloud transfer is implied.

Original hashing is incremental rather than a whole-file buffer. For sources over 32 MB, the combined ZIP is deliberately not constructed in memory; download evidence chunks and retain the original XML separately. Smaller sources may download a combined originals/evidence ZIP.

Accounting → Tally Data Import → **Select snapshot folder** reads four company manifests once: ABOOD TRADINGS, ABRAZ SLEEPING SOLUTIONS, ABZ - EST and ESTIMATE. Download one ZIP containing byte-for-byte originals, source manifests, per-company JSONL chunks and a report. No scheduled task, provider credentials, Tally write, database mutation, live posting, automatic approval or cutover is involved.

This is **not a completed cloud staging transfer**. The current schema only permits the caller's active company; there is no dedicated ESTIMATE destination or approved atomic resumable multi-company upload service. No migrations were applied. The repository snapshot exporter has no 1.0.9 version contract; this implementation accepts the existing `company/segments/path/bytes/sha256` manifest shape and rejects other shapes rather than guessing. Verify real 1.0.9 manifests before activation.

## Evidence and normalization

- Original XML bytes and their manifest SHA-256 checksums are retained in the ZIP without rewriting. Header/source name mismatches, missing files, hash/size mismatches and incomplete envelopes fail the whole local preparation.
- Import-only normalization version `tally-import-only-v1` replaces forbidden XML 1.0 control characters and numeric references, including literal `&#4;`, with visible `[TALLY_CONTROL_U+0004]` markers, never silently deleting them. Every replacement records original UTF-16 string offset, original text and replacement. Valid tab/newline/carriage-return references stay unchanged.
- An undeclared `UDF` prefix is given `xmlns:UDF="TallyUDF"` only on the derivative TALLYMESSAGE. Existing namespace declarations remain intact. Other undeclared prefixes, DTD/entities, malformed/truncated XML are rejected.
- Each row retains the original full message XML, normalized message XML and the full parsed source object including UDF/custom fields, nested ledger/inventory/bill/cost-centre allocations, opening quantity/value/balance, source IDs and lifecycle markers. No custom fields are promoted into canonical accounting columns. Unknown master kinds are preserved, not discarded.
- Source GUID/REMOTEID, ALTERID and MASTERID are retained as strings. Missing IDs, duplicate record-type/GUID or record-type/ALTERID, and duplicate MASTERID are quarantined/reportable, not matched by name. Stable source/version keys support deterministic retry output; changed payload under the same identity must be resolved, never overwritten.
- The 474-byte Import Data settings screen is not masters: no TALLYMESSAGE records is a hard rejection. Complete group/ledger/stock/godown/cost-centre/unit masters plus source company identity and voucher history are required; empty categories need separately verified source evidence before activation.
- ESTIMATE and ABZ - EST always remain distinct source archives and cannot be assigned to official books by this path.

## Limits and reconciliation

XML decoding is streamed (UTF-8 or BOM-marked UTF-16), messages are bounded at 16 MB, files at 256 MB, selected folders at 512 MB. Original hashing reads stream chunks. JSONL chunks contain at most 250 rows and target 4 MB; an indivisible larger message is retained intact. Derivative chunks are still held in browser memory; larger historical datasets need an approved local disk-streaming/remote resumable transport, not an unbounded browser upload. Inputs are never sent anywhere by this feature.

Report includes rows by source type, vouchers, posted-only debit/credit totals, inventory lines, bill allocations, lifecycle counts, normalizations, missing identifiers, duplicates and rejects. These are source checks, **not ERP reconciled balances**. Decimal precision, source-reference resolution, complete master category counts, date-range coverage/overlaps, signed stock unit/value reconciliation, and accountant-certified source totals remain activation requirements.

## Actual available source evidence

The mounted `Master.xml` is 122,916,286 bytes (UTF-16), selects ESTIMATE and contains 57,286 `&#4;` references. Actual local processing with the new upload domain logic produced 7,021 rows, including 3,963 stock items, 2,573 ledgers, 167 cost centres, 64 groups, 18 units and 3 godowns, plus other master categories. These are raw preserved record counts (not deduplicated canonical counts). The report identified 142 duplicate rows, 144 rejected/quarantined rows and one missing source ID; 6,727 rows required documented normalization. There are **zero vouchers**, so debit/credit totals of zero do not establish reconciliation. Forty-nine evidence files total 192,767,083 bytes including generated evidence/manifest. This run processed source data locally in the sandbox, not in a signed-in browser, and did not persist the generated artifacts or any database rows. Its COMPANY object does not supply a verified company GUID; remote-company links are not inferred as that identity. The referenced 165 MB archive is not mounted in this session. This is **not four complete source bundles** and has not been transferred or reconciled.

## Hard activation blockers

1. Actual four TallyBridge 1.0.9 manifests and their complete hashed master/voucher segments; confirm company GUID binding, voucher history/date coverage, deleted/cancelled export behavior and complete collection contract on the Tally PC.
2. Approved additive staging-only transaction protocol: immutable original-file references, unique company/source/checksum run key, numbered chunk hashes, atomic idempotent acceptance, resumable failed/incomplete states and final count/hash verification before validation. Current run status CHECK does not permit `failed` despite the legacy handler trying to use it.
3. A dedicated non-official ESTIMATE/ABZ - EST staging boundary plus caller-authorized company membership checks. Do not change the user's active company repeatedly or use privileged clients to bypass RLS.
4. Source identity/mapping and accountant reconciliation, verified recovery and the existing approved migration workflow. No canonical import can activate from local validation alone.

## Verification

Continuation inspected starting commit `8a9b6b7ad0b9171407f851907a0d02d9fb5c43fc`. A read-only database query confirmed **0 migration runs and 0 staging rows**. Live company shells are ABOOD, ABRAZ, ABOOD_MGMT and ABRAZ_MGMT; no exact ESTIMATE or ABZ - EST destination exists, and management shells are not silently treated as those source companies. The requester-specific preview session could not be minted because no matching auth account exists. Signed-in upload interaction therefore remains unverified; no account was selected arbitrarily.

Focused tests cover normalization, UDF/raw payload retention, totals/bills, deleted lifecycle, malformed/settings rejection, message boundaries, manifests, hash tampering, company isolation, deterministic retry and ZIP original-byte preservation. Actual four-company transfer/browser source processing is unverified until complete real bundles exist.

Continuation checks: 14 focused tests passed; full suite 268 tests across 46 files passed; lint returned zero errors and 14 existing warnings. Additional regressions cover streaming hashing without whole-file reads, direct UTF-16 ESTIMATE identity/isolation, ZIP rejection, missing-header rejection and duplicate source paths. Automatic preview diagnostics reported build OK at 11:37:58 UTC. A signed-out browser visit to `/tally-import` returned the correct page title with no captured runtime errors but remained at the workspace session-loading screen; it did not verify upload controls or an authenticated flow. No manual project build/typecheck was run.