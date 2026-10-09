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

## Browser local connection (read-only)

On the Tally PC, install dependencies and use `npm run serve` instead of the snapshot command.
Set `TALLY_ALLOWED_ORIGIN` to one exact ERP HTTPS origin (no trailing slash) and
`TALLY_PAIRING_KEY` to a strong random value of at least 32 characters. Enter the same
key in Accounting → Tally Data Import. It is held in browser memory only.
The server binds only to `127.0.0.1:9010`; Tally remains at `127.0.0.1:9000`.
Never expose these ports publicly. Browsers may require local-network permission.

Authenticated GET `/companies` exports List of Companies and requires actual company
NAME/GUID fields. GET `/export` accepts `companyGuid`, `from`, `to`, and one allowed
`kind` (the five master collections, List of Units, or DayBook). There are no filesystem
or Tally write endpoints. Origin, Host and pairing key are checked on every read.
No wildcard origin is supported. The live collection/export format has not been
verified against the user's installed TallyPrime release: missing GUIDs, ambiguous
same-name companies or unsupported message envelopes fail explicitly.

The UI currently offers source preview/validation only. Canonical transactional Tally
commit, changed-voucher policy, ledger/stock identity mapping and verified isolated
recovery remain required before live import. No successful sync is fabricated.
