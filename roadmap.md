## Open tasks
- [x] Add Tally Connect as an admin-only dashboard action linking to its separate signed-in app
- [x] Resolve the reported publishing build failure: latest build signal is OK; preview responds successfully
- [x] Make Tally accounting uploads fail closed and display voucher-line control totals and integrity issues without saving incomplete accounting data
- [x] Canonical bill-wise model implemented in repository with invoice-linked bills, party-ledger resolution, receipt allocation, reversal and idempotency paths
- [x] AI layer: routes, sidebar/permissions, contextual buttons, working NVIDIA models, verified Ask Maestro + document extraction against live data
- [ ] Tally full accounting migration: masters, vouchers with DR/CR entries, bill-wise allocations, opening balances, GST components, stock/godown/batch, cost centres, voucher types/numbers/refs, Tally IDs, reconciliation UI
- [ ] Execute the audited TallyPrime-retirement remediation and cutover plan
  - [x] Phase 1 Accounting Foundation implemented as an isolated migration and fixture suite
  - [x] PostgreSQL integration/concurrency tests completed in disposable isolated database with synthetic fixtures
  - [x] Durable fail-closed Phase 1 database harness, fixtures, preflight, direct-write audit, and managed-security checks committed
  - [x] Harden managed validation runners to require an explicit non-production TEST identity before mutating SQL
  - [x] Replace manual voucher and number-series client writes with the authenticated atomic posting path
  - [ ] Production Phase 1/2 promotion, preflight, validation and reconciliation against existing live records
  - [x] Phase 2 canonical bill-wise receivable/payable repository model and isolated tests
  - [x] Phase 3 stock ledger hardening: immutable movements, weighted-average issues, valued transfers and reversal safety prepared
  - [x] Phase 3 production integration functions prepared for BOM consumption, finished-goods receipt and dispatch using mapped stock items
  - [ ] Phase 3 opening stock valuation: obtain source valuation/rate from Tally before assigning any value; zero-rate opening stock remains quantity-only
  - [ ] Phase 3 accounting integration: install and validate canonical posting functions without rewriting historical records
  - [ ] Managed/live database integration tests and security/grant verification
- [x] Premium ERP UI redesign: flagship Zizz homepage, brand portfolio, shared shell/components, responsive verification
- [x] Default invoice print layout based on the supplied Abood Tradings tax invoice reference

## 2026-10-04 direct-repository hardening
- [x] Canonical invoice bill/receipt/reversal definitions use party ledgers and `create_gl_voucher`; no global `Debtors` assumption and no invented tax split
- [x] Canonical voucher reversal/cancellation functions now create compensating vouchers and preserve originals
- [x] Inventory ledger preserves perpetual weighted-average value through issues and godown transfers; opening rows remain untouched
- [x] Prepared production BOM consumption, finished-goods receipt and sales-order dispatch functions use `stock_items.mapped_raw_material_id` / `mapped_model_id`
- [x] Production UI no longer calls the stock issue function with null item/godown/quantity; it calls the dedicated production lifecycle functions
- [x] Invoice taxed-posting path remains fail-closed because the current invoice schema stores only aggregate `tax_amount`
- [x] Added `accounting-phase3/PRODUCTION_TALLY_REPLACEMENT_PREFLIGHT.sql` as a read-only live reconciliation gate covering GL, years, bills, party/supplier mappings, system ledgers, inventory valuation, BOM validity and database grants
- [x] Added Tally-style multi-company foundation: companies, per-user company access, active-company switching, company-scoped masters/transactions, independent financial years, voucher series and chart of accounts
- [x] Existing company data is assigned to Abood Tradings; Zizz Smart Sleep Technologies LLP is provisioned as a separate empty company shell
- [x] Company creation clones the chart structure, creates a fresh financial year and resets voucher series for the new company
- [x] Restrictive company-scope RLS prevents authenticated users from crossing the active-company boundary while preserving existing role/ownership policies
- [x] Company selector added to desktop and mobile ERP shell; administrators can create additional companies from the selector
- [ ] Add company/group consolidated reporting and controlled inter-company transactions
- [ ] Do not install accounting/inventory SQL until production compatibility, recovery and database-level validation requirements are satisfied

## 2026-10-04 repository engineering checkpoint
- No production database writes were performed from this repository session.
- Prepared accounting/inventory SQL was not installed by this repository session.
- Inventory and accounting SQL still require database-level integration tests against the actual live schema before installation.
- Tally opening-stock valuation is intentionally not invented; it must come from Tally/source records.
- Production finished-goods valuation is intentionally blocked unless the mapped finished-good stock item has a positive valuation rate.
- The repository connection can modify GitHub source, but it does not provide a privileged live PostgreSQL/Supabase session; live reconciliation and production migration cannot truthfully be marked PASS from GitHub alone.
