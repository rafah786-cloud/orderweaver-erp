
## Open tasks
- [x] Add Tally Connect as an admin-only dashboard action linking to its separate signed-in app
- [x] Resolve the reported publishing build failure: latest build signal is OK; preview responds successfully
- [x] Make Tally accounting uploads fail closed and display voucher-line control totals and integrity issues without saving incomplete accounting data
- [ ] Complete canonical bill-wise workflow and accounting reports (blocked on unapplied Phase 1/2 migrations and verified production recovery)
- [x] AI layer: routes, sidebar/permissions, contextual buttons, working NVIDIA models, verified Ask Maestro + document extraction against live data
- [ ] Tally full accounting migration (TallyPrime → ERP replacement): masters, vouchers w/ DR/CR entries, bill-wise allocations, opening balances, GST, stock/godown/batch, cost centres, voucher types/numbers/refs, Tally IDs; reconciliation UI; report Completed/Partial/Blocked + changed files
- [ ] Execute the audited TallyPrime-retirement remediation and cutover plan
  - [x] Phase 1 Accounting Foundation implemented as an isolated migration and fixture suite; not applied to the shared live database
  - [x] Apply and run PostgreSQL integration/concurrency tests in a disposable isolated database with synthetic fixtures (25 PASS, 0 FAIL)
  - [x] Commit durable fail-closed Phase 1 database harness, synthetic fixtures, preflight, direct-write audit, and managed auth/RLS/grant checks
  - [ ] Repeat managed authentication/RLS and copied-data reconciliation in a separately provisioned managed test project before production promotion (blocked: no separate managed project connected)
  - [x] Phase 2 bill-wise receivables/payables, opening bills, sales/purchase bill linkage, settlements, reversals and ageing implemented and locally database-tested in isolation (14 PASS, 0 FAIL); unapplied to shared live database
  - [ ] Validate Phase 2 managed auth/RLS/pooling and copied-data reconciliation in a separate managed test project before any screen/workflow cutover (blocked: no separate managed project connected)
  - [x] Harden managed validation runners to require and display an explicit non-production TEST identity before mutating SQL
  - [x] Replace manual voucher and number-series client writes with the authenticated Phase 1 atomic posting function
  - [ ] Production Phase 1/2 promotion, preflight, validation and reconciliation (blocked: a complete restorable production backup/restore point cannot be verified; no migrations or validation SQL run)
  - [ ] Phase 3 inventory ledger hardening: perpetual weighted-average valuation, immutable movements, transfer value preservation, reversal safety, live posting functions and document-state integration
  - [ ] Phase 3 production consumption: confirm BOM units, scrap/wastage rule, output quantity and finished-goods posting before enabling production stock accounting
  - [ ] Phase 3 opening stock valuation: obtain source valuation/rate from Tally before assigning any value; zero-rate opening stock remains quantity-only
  - [ ] Phase 3 accounting integration: replace legacy direct-balance/stock writes with canonical posting functions without rewriting historical records
- [x] Premium ERP UI redesign: flagship Zizz homepage, brand portfolio, shared shell/components, responsive verification
- [x] Default invoice print layout based on the supplied Abood Tradings tax invoice reference

## 2026-10-04 direct-repository hardening
- [x] Reworked the uninstalled invoice bill/receipt/reversal definitions to use party ledgers and the canonical `create_gl_voucher` path; no global `Debtors` assumption and no invented tax split
- [x] Hardened isolated inventory ledger to preserve perpetual weighted-average value through issues and godown transfers; opening rows remain untouched
- [x] Hardened the prepared stock posting SQL with item-row locking, idempotency enforcement, signed running-value weighted average, valued transfers, and immutable reversal posting; remains uninstalled
- [x] Added isolated weighted-average issue and destination-transfer test coverage
- [ ] Do not install accounting/inventory SQL until production compatibility and recovery requirements are explicitly satisfied

## 2026-10-04 repository engineering checkpoint
- No production database writes were performed from this repository session.
- No prepared accounting/inventory SQL was installed.
- GitHub repository changes are source-code/prepared-SQL changes only; live deployment status must be verified separately.
- Inventory SQL still requires database-level integration tests before installation.
