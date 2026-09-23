# Harden accounting test isolation and voucher posting

## Scope

- Do not run database validation or apply either accounting migration.
- Do not change production data, inventory, GST, TallyBridge, or unrelated workflows.

## Implementation

1. **Fail-closed managed TEST targeting**
   - Add one shared test-target guard used by both Phase 1 and Phase 2 runners.
   - Accept only an explicit managed TEST database URL and explicit expected TEST project/database identity.
   - Reject generic `TEST_DATABASE_URL`, inherited production/preview variables, localhost, mismatched hosts, production project identity, and missing SSL requirements.
   - Before any fixture or migration SQL, connect read-only and print the resolved host, project reference, database, server address/port, and authenticated database user.
   - Compare the resolved identity to the explicit expected TEST identity and stop on any mismatch.

2. **Atomic voucher creation**
   - Change the new-voucher screen to call the authenticated `createGlVoucher` server function once.
   - Let the Phase 1 database function allocate the voucher number, write header and entries atomically, validate balance, enforce financial-year controls, and apply idempotency.
   - Preserve successful navigation and receipt notifications using the returned voucher ID and number.

3. **Remove client-side numbering writes**
   - Delete the client helper that reads and increments `voucher_number_series`.
   - Audit application source for direct inserts/updates/deletes on vouchers, voucher entries, and number series; report any remaining call sites without expanding scope.

4. **Verification without database writes**
   - Run focused frontend/type tests and the direct-write source audit only.
   - Exercise runner guard failures with fake/non-production URLs without opening a database connection.
   - Record the task status in the roadmap.

## Expected stopping point

The code and runners will be ready, but managed validation remains blocked until a separate TEST project is provisioned. The final report will name changed files/functions and state that no TEST database identity can be truthfully verified yet if none is available.
