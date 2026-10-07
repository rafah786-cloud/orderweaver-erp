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
