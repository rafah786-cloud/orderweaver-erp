
## Open tasks
- [x] AI layer: routes, sidebar/permissions, contextual buttons, working NVIDIA models, verified Ask Maestro + document extraction against live data
- [ ] Tally full accounting migration (TallyPrime → ERP replacement): masters, vouchers w/ DR/CR entries, bill-wise allocations, opening balances, GST, stock/godown/batch, cost centres, voucher types/numbers/refs, Tally IDs; reconciliation UI; report Completed/Partial/Blocked + changed files
- [ ] Execute the audited TallyPrime-retirement remediation and cutover plan
  - [x] Phase 1 Accounting Foundation implemented as an isolated migration and fixture suite; not applied to the shared live database
  - [x] Apply and run PostgreSQL integration/concurrency tests in a disposable isolated database with synthetic fixtures (25 PASS, 0 FAIL)
  - [ ] Commit durable Phase 1 database harness, fixtures, preflight, auth/RLS/grant and pooling checks
  - [ ] Repeat managed authentication/RLS and copied-data reconciliation in a separately provisioned managed test project before production promotion (blocked: no separate managed project connected)
  - [ ] Phase 2 bill-wise receivables/payables, opening bills and ageing — isolated implementation initiated
  - [ ] Phase 3 and later phases not started
- [x] Premium ERP UI redesign: flagship Zizz homepage, brand portfolio, shared shell/components, responsive verification
- [x] Default invoice print layout based on the supplied Abood Tradings tax invoice reference
