# Mattress Maestro Direct TallyBridge

This local utility replaces the slow manual All Masters XML export for the initial migration.

It calls the TallyPrime HTTP gateway directly, requests targeted master collections, and splits the Day Book transaction history into date-bounded segments. It never writes back to Tally.

TallyPrime documents HTTP/XML integration on the default port 9000 and supports company-qualified requests using SVCURRENTCOMPANY. TallyPrime 7.0+ also supports JSON/JSONEx; XML is used here first so the bridge remains compatible with older releases.

Prerequisites:
1. TallyPrime running.
2. HTTP Server enabled in TallyPrime.
3. Required companies loaded/accessible.
4. Node.js 20+ on the Tally PC.

Example PowerShell:
$env:TALLY_URL="http://127.0.0.1:9000"
npm install
npm start -- --from 2018-04-01 --to 2026-10-06 --chunk-months 1 --company "Abood Tradings" --company "Abraz Sleeping Solutions"

Add the other company names as additional --company arguments. Use the real earliest accounting date for the first migration.

The bridge writes tally-snapshots/<company>/manifest.json plus the raw XML segments. Each segment is SHA-256 hashed. A failed request stops the affected company instead of silently producing an incomplete snapshot.

The next application step is to feed these segments into the existing Tally migration staging/control plane. The uploaded XML path remains as a fallback.


## ERP migration staging bundles

After a direct read-only snapshot has been extracted, convert its master collections and date-bounded Voucher Register segments into staging bundles:

```powershell
npm run bundle -- ".\tally-voucher-register-april\ABOOD_TRADINGS\manifest.json" ".\erp-staging-abood-april"
```

The command writes one JSON bundle per date segment. The first bundle carries the master snapshot and opening balances; subsequent bundles carry only their period's vouchers, inventory movements, ledger entries, and voucher-linked bill allocations. Each bundle includes a source checksum and control totals. Upload each `staging-bundle-*.json` through Mattress Maestro's **Import from Tally → Migration control plane** and stage it against the matching official ERP company. The ERP stages large bundles in bounded chunks and validates only after all chunks in that bundle succeed.

**Safety boundary:** this creates validated staging runs only. It does not post accounting transactions, update inventory balances, write to Tally, or approve the migration. Review reconciliation and company mappings before any future canonical import.


## Build an ERP staging bundle from verified snapshots

After a company snapshot is extracted, the bundle builder verifies every segment's SHA-256 before parsing and writes the JSON format accepted by the ERP's **Tally Import → Migration staging** flow. This is a local conversion only: it does not upload or post anything.

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run bundle -- ".\tally-voucher-register-april\ABOOD_TRADINGS\manifest.json" ".\ABOOD_TRADINGS-staging-bundle.json"
```

Use the manifest for the full snapshot, not an isolated date segment. In the ERP, select the matching official target company, upload the generated JSON bundle in the migration staging area, review the source company and control totals, then stage and validate. Do not commit to live books until accounting and inventory reconciliation is approved. **Company separation is mandatory:** the two legal/official entities are `ABOOD TRADINGS` and `ABRAZ SLEEPING SOLUTIONS`. Their management books are separate datasets: `ESTIMATE` belongs to `ABOOD TRADINGS`; `ABZ - EST` belongs to `ABRAZ SLEEPING SOLUTIONS`. Never merge either management book into its official company or into the other entity. Treat each source company as its own migration run and target only its matching ERP company/book. Management-book staging remains blocked by the current ERP guard until an explicit, audited management-book migration path is implemented.

The bundle builder refuses changed snapshot segments (SHA-256 mismatch), duplicate record-type/source-key pairs, or empty parsed bundles. Source company GUID is left null unless it is established by a verified source field; do not infer it from the company name.


## Required four-way source separation

| Tally source company | Relationship | Migration boundary |
| --- | --- | --- |
| `ABOOD TRADINGS` | Official books | Its own run; target only the ERP company for ABOOD TRADINGS |
| `ESTIMATE` | Management books for ABOOD TRADINGS | Separate run and dataset; never merge into ABOOD TRADINGS official books |
| `ABRAZ SLEEPING SOLUTIONS` | Official books | Its own run; target only the ERP company for ABRAZ SLEEPING SOLUTIONS |
| `ABZ - EST` | Management books for ABRAZ SLEEPING SOLUTIONS | Separate run and dataset; never merge into ABRAZ SLEEPING SOLUTIONS official books |

A shared business relationship does not make management books interchangeable with the official books. Do not infer target company identity from similar names. The current UI deliberately blocks migration while a management-book ERP company is active; do not bypass that guard. A separate, explicitly approved path is required if those management datasets are to be staged in ERP.
