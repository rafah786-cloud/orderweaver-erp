# Security coverage inventory — Mattress Maestro ERP and Zizz Mattress

**Baseline reviewed:** 18 October 2026  
**Source baseline:** main at 79248ccd41917d631194fc628a3b24296e9b8359  
**Status:** Iterative audit in progress; this file is not a claim of complete security certification.

## Security model and benchmark

Use the same high-level control principles documented by major ERP vendors:

- **Least privilege and layered authorization:** Microsoft Dynamics 365 models authorization as roles → duties → privileges → permissions and supports data restrictions at table, field and row level: https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-oa
- **Organizational data restrictions and role-specific access:** SAP S/4HANA role design uses restrictions such as company code, plant and sales organisation, and recommends aligning privileges with the user's workplace: https://help.sap.com/docs/SAP_S4HANA_CLOUD/53e36b5493804bcdb3f6f14de8b487dd/e818f86038a145a181b9e0e3c3b3f2f0.html
- **Segregation of duties (SoD):** conflicting capabilities such as supplier maintenance, goods receipt and supplier payment should be independently assigned and checked—not inferred from hidden buttons.

For Mattress Maestro, route-level permissions are only the UI boundary. The security boundary is the combination of verified session identity, server-function checks, SQL/RPC authorization, database grants and RLS. A route appearing below does **not** by itself prove all data operations reachable from that route are authorized.

## 1. Frontend route → role inventory

Source: src/lib/permissions.ts. The route guard in src/lib/app-access.ts fails closed when no matching route policy exists. This is a route inventory, not proof of database enforcement.

| Route area | Roles admitted by route guard |
|---|---|
| /dashboard | Admin, Accountant, Sales, Production, HR, Customer, Employee |
| /parties | Admin, Sales |
| /website-enquiries | Admin, Sales |
| /invoices | Admin, Sales, Accountant, Customer |
| /sales-orders | Admin, Sales, Customer |
| /boq | Admin, Sales, Production |
| /purchases | Admin, Accountant, Production |
| /production | Admin, Production, Sales |
| /mrp | Admin, Production, Accountant |
| /capacity | Admin, Production |
| /operations | Admin, Accountant, Sales, Production, HR |
| /enterprise-workbench | Admin |
| /employees | Admin, HR |
| /attendance | Admin, HR, Employee |
| /payslips | Admin, HR, Employee |
| /approvals | Admin |
| /whatsapp | Admin, Accountant, Sales, Production, HR, Employee, Customer, Vendor |
| /communications/inbox | Admin, Accountant, Sales, Production, HR, Customer, Employee, Vendor |
| /communications (provider/configuration and administration) | Admin |
| /tally-import, /local-tally-accounts | Admin |
| /accounting, /gst, /banking | Admin, Accountant |
| /inventory | Admin, Accountant, Production, Sales |
| /ai | Admin, Accountant, Sales, Production |
| /print | Admin, Sales, Production, Accountant, Customer, Vendor |
| /vendor | Admin, Vendor |
| /settings | Admin |

Nested routes inherit the most specific registered policy. New private routes must receive an explicit policy; route-policy tests inventory _app.* route files.

## 2. Verified enforcement map (initial coverage)

| Data / operation | Intended permission boundary | Evidence and status |
|---|---|---|
| AI conversations/messages | Analyst roles for AI; history tied to caller and active company | ai.functions.ts checks roles, owner and company for conversation reads. Live RLS also binds messages to caller-owned conversations. Regression coverage exists; direct tool/retriever authorization is still being audited. |
| Website enquiry inbox | Approved Admin/Sales only; active company; authenticated readers cannot create rows; only status/notes/assignment updates are granted | Live website_enquiries policies and column grants inspected; migration 20261018140000_zizz_website_enquiries.sql is additive. Public submission goes through a validated server route using service role and phone-based throttling. |
| Accounting vouchers | Admin/Accountant; selected financial-year close/reopen operations more restricted | accounting.functions.ts checks role and calls database RPCs. The RPC bodies, grants and every indirect trigger remain subject to deeper adversarial tests. |
| Invoice reads | Admin/Accountant, Sales-created records, and customer-owned party records, scoped by company | Live inv read policy and company_scope_invoices policy inspected. Invoice line reads inherit the invoice permission logic. |
| Bank accounts / bank transactions | Admin/Accountant; bank account and transaction company boundary; matching RPC also validates account/company/source/direction | Live policies and bank-reconciliation-rpc isolated CI test inspected. |
| Employee records / payslips | Admin/HR; employee self-access to own employee record and payslips; active company | Live RLS policies inspected. More tests are still needed for all joins, exports, print routes and historical company switching. |
| Sales orders / production orders | Company-scoped; customer rows restricted to their linked party; sales reads limited by owner; production roles have operational visibility | Live RLS policies inspected. The order RPC and every dependent item/stock operation need continued cross-role testing. |
| Generic enterprise workbench | Admin-only mutations enforced with restrictive policies; company boundary retained | Isolated PostgreSQL CI test covers overlapping permissive policies and admin/non-admin writes for listed tables. |
| Additive enterprise-domain tables | Company access and explicit can_view, can_create, can_edit, can_delete; system-owned evidence/workflow tables are client-read-only | SQL migration and isolated tests inspected. Live policies were read back for representative tables. |
| Tally migration staging | Admin role and company access, active-company validation on run review/validation/reconciliation | tally-migration.functions.ts inspected. Full RPC/grant, large-payload, and race/idempotency tests remain open. |
| Vendor purchase bills | Vendors may see/acknowledge only their own supplier's order in the active company; commercial/receipt fields remain buyer-controlled | **High-priority defect found:** live pb_vendor_ack policy grants row-scoped UPDATE, but the old guard_vendor_purchase_bill_update() trigger omitted multiple tax and receipt-state fields. A direct vendor API update of receipt_status='received' could reach post_purchase_to_voucher() and call ensure_purchase_bill(). Narrow trigger hardening and isolated regression tests are proposed in the associated security PR. Do not treat the production database as fixed until the migration is applied and the trigger is re-read. |

## 3. Must-test adversarial cases

Each module should be tested with separate synthetic identities and companies, not just mocked role booleans:

- **Identity and approval:** unauthenticated; expired/revoked session; pending/rejected/disabled profile; valid but unapproved user; user A attempting user B's records; same user after logout/account switch.
- **Company and department:** company A against company B; active-company switching; records with forged company_id; access to inactive books and management books; joins from parent to child; department-specific HR, payroll, production, purchasing, sales and finance data.
- **CRUD and workflows:** direct REST/API and SQL RPC calls bypassing the UI; update/insert mass assignment; hidden/unknown fields; changing IDs/owners/company IDs; duplicate/replayed calls; concurrent approvals; invalid workflow transitions; cancellation/reversal and timestamp spoofing.
- **High sensitivity:** bank matching and settlement; voucher/period posting; payroll and employee records; supplier/customer contact and invoices; backups; Tally source files and staged records; AI documents/conversations, retrieval results and generated proposals; provider credentials, logs and webhook events.
- **Platform controls:** RLS plus GRANT/REVOKE; SECURITY DEFINER search paths and execute privileges; storage bucket policies; realtime publication scope; file/print/PDF routes; URL redirect safety; error messages and logging of personal/financial data.

## 4. Findings and work backlog

| ID | Severity | Finding | Required fix / acceptance gate |
|---|---|---|---|
| SEC-2026-001 | High | Vendor purchase-bill acknowledgement guard did not protect receipt_status, CGST/SGST/IGST amounts and additional identity/commercial fields. A receipt-state update has an after-update hook that invokes ensure_purchase_bill(). | Replace the guard with a protected-field comparison and one-time acknowledgement transition; add isolated PostgreSQL tests for legitimate accept/reject, forbidden tax/receipt/company/ID updates, other-supplier IDs, cross-company rows and internal production writes. Apply only after CI passes and retain rollback SQL. |
| SEC-2026-002 | Medium / coverage gap | Route authorization inventory is more complete than the server-function → RPC → table-policy inventory. Existing requireSupabaseAuth checks token validity, but that alone does not prove approval, business role, ownership, company or field-level permission for each handler. | Complete per-function mapping and adversarial test coverage before calling security review complete. |
| SEC-2026-003 | Medium / coverage gap | Company-level can_view/can_create/can_edit/can_delete does not automatically express every department/record-owner restriction on legacy tables. | Verify each sensitive table and child relationship; introduce specific row/field restrictions only with tests demonstrating existing users retain required access. |
| SEC-2026-004 | Medium / coverage gap | Segregation-of-duties conflict detection and role-combination governance are not yet proven end-to-end. | Inventory critical incompatible capabilities (e.g., supplier master changes vs. bill/receipt posting; payroll changes vs. payroll approval; journal preparation vs. period reopening) and add admin assignment warnings/blocks with audit records. |
| SEC-2026-005 | Medium / coverage gap | Storage, realtime channels, exports/print endpoints, all SECURITY DEFINER functions and external integration callbacks have not yet received exhaustive live-policy plus synthetic-identity coverage. | Continue catalog-driven review; every externally reachable path must have an explicit owner/role/company rule and a negative regression test. |

## 5. Change and release discipline

- Never regard a hidden button as authorization. Every mutation must be enforced in a trusted server/database layer.
- Do not change accounting, inventory, Tally migration/cutover or company isolation to make a test pass.
- Run adversarial tests against disposable PostgreSQL and validate applicable CI before proposing production migration.
- For any security migration affecting posting/receipt hooks, retain a rollback script, record before/after function definitions, and verify live readback after deployment.
- Keep Live Razorpay checkout disabled until order persistence, authoritative pricing/tax, inventory reservation, webhook verification/idempotency, reconciliation, delivery, policy and fulfilment gates are complete.
- Update this inventory as findings are confirmed, remediated and independently re-tested. Never label the system “fully secure” from source review alone.


## 6. Findings from the 18 October 2026 iterative cycle

| ID | Severity / confidence | Finding | Action / acceptance criteria |
|---|---|---|---|
| SEC-2026-012 | High; confirmed in source, deployment not verified | `budgets`, `bank_reconciliations` and `fixed_assets` have an admin-only write guard but no equivalent database role gate for reads. Existing company-view policy can be broader than the `/banking` route's Admin/Accountant role boundary. | Proposed restrictive role guard + isolated PostgreSQL test. Require CI pass, apply only to the confirmed ERP database, read back the policy and verify negative direct-API tests for Sales, Production, HR, Employee, Customer and Vendor. |
| SEC-2026-013 | High operational blocker; confirmed mismatch | Tracked root `.env` project ID/URL differ from the Supabase project available to the connected database tool. The latter exposes only the Tally archive registry table, not the app schema described by repository migrations. | Resolve the deployed app's actual Supabase project before claiming live authorization coverage or applying ERP migrations. No secrets were printed; the tracked file currently contains public client configuration, but must be removed after builds no longer depend on it. |
| SEC-2026-014 | Medium; applies to connected archive DB only | `authenticated` has excess `TRUNCATE`, `REFERENCES` and `TRIGGER` grants on `tally_archive_uploads`; three owner policies have avoidable per-row auth-function evaluation warnings. | Do not patch until project identity is reconciled. Revoke the excess grants, optimize policy expressions, then recheck catalog and performance advisor on the correct database. |

**Coverage limitation:** This cycle did not prove live role/department behavior for the full ERP because the connected Supabase target does not match the project URL/reference embedded in the tracked build configuration. Source-level findings and CI tests are useful, but they are not a substitute for testing the actual deployed database with synthetic identities.

## 2026-10-24 coverage delta — Tally archive upload (PR #35, not yet merged)

The archive upload panel is described in PR #35 as part of the Tally Data Import page. The exact frontend route path was not confirmed from the current `main` tree, so this entry records the page-level route label rather than inventing a path. UI visibility is not an authorization boundary.

| Route/page label | Role/state | Data operation | Data surface / enforcing policy | Regression coverage / status |
|---|---|---|---|---|
| Tally Data Import → archive list | Approved Admin; own uploaded records | Read | `public.tally_archive_uploads` SELECT; `tally archive uploads owner read`; requires `user_id = auth.uid()` and `can_access_tally_archive(auth.uid())` | Proposed in PR #35; disposable PostgreSQL test added, run result not visible yet |
| Tally Data Import → upload archive | Approved Admin; caller owns destination folder | Create registry row and Storage object | Registry INSERT with `processing_status='uploaded'`; Storage `tally archive owners upload own files`; approved Admin helper plus first folder segment = `auth.uid()` | Proposed adversarial tests cover Sales, pending Admin, forged user ID and forged Storage folder |
| Tally Data Import → remove own archive | Approved Admin; own record/folder | Delete | Registry DELETE and Storage DELETE policies require approved Admin plus owner scope | Proposed test job; not yet verified green |
| Archive processing/status transition | Server-side service role only | Update processing status | Browser role has no UPDATE grant/policy; `service_role` retains server-side table privileges | Grant assertion added; live worker/runtime behavior not verified |
| Any page/direct PostgREST request | Anonymous or non-Admin / pending or rejected | Read/create/delete | Anonymous table access revoked; RLS helper binds the passed identity to `auth.uid()`, approved profile status and the database-backed `admin` role | Proposed direct SQL/RLS adversarial test; actual HTTP/API integration test still outstanding |
| Any browser/API SQL session | Authenticated | TRUNCATE / trigger / references / UPDATE | Registry table ACL is revoked then narrowed to SELECT/INSERT/DELETE; RLS alone would not constrain TRUNCATE | Proposed ACL assertions; must pass CI before merge |

**Residual gaps:** This coverage delta describes the proposed migration and test in PR #35, not a deployed control. The connected Supabase project reference does not match `supabase/config.toml`, so do not treat its catalog as the production ERP. Verify the actual deployed backend, run the new disposable-PostgreSQL job, test HTTP/PostgREST and Storage API behavior with synthetic tokens, and confirm the migration ledger before deployment.
