
## Open tasks
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
  - [ ] Phase 3 and later phases not started
  - [x] Phase 3 inventory ledger implemented as isolated schema inventory_ledger (weighted average, reservations, transfers, production consumption/receipt, reversal). Reference rules passed. Not applied to the shared live database and not wired to screens.
- [x] Premium ERP UI redesign: flagship Zizz homepage, brand portfolio, shared shell/components, responsive verification
- [x] Default invoice print layout based on the supplied Abood Tradings tax invoice reference
