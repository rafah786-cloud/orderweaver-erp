# Security audit register — 18 October 2026

**Repository baseline:** main 0093d102b74d230a2fd3b232216abf1bd8ae8592  
**Connected database:** existing Mattress Maestro Supabase project  
**Status:** Evidence-based audit in progress; not a security certification.

## Security baseline and benchmark

Apply the core patterns of mature ERP authorization design:

- Microsoft Dynamics 365 describes a role → duty → privilege → permission model and table/field/row access restrictions: https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-oa
- SAP S/4HANA role design supports organizational restrictions such as company code, plant and sales organization and recommends least privilege: https://help.sap.com/docs/SAP_S4HANA_CLOUD/53e36b5493804bcdb3f6f14de8b487dd/e818f86038a145a181b9e0e3c3b3f2f0.html

These references are benchmarks, not an assertion that this ERP already implements equivalent coverage.

## Confirmed findings

### SEC-2026-001 — Vendor can attempt to change purchase-bill commercial/receipt fields

**Severity:** High  
**Evidence:** Connected database had pb_vendor_ack UPDATE policy for a vendor's supplier rows plus a guard_vendor_purchase_bill_update() trigger that omitted receipt_status and CGST/SGST/IGST fields. Updating receipt_status to received reaches an after-update trigger which calls ensure_purchase_bill().  
**Fix proposed:** The guard hardening was merged to main in PR #104 after isolated PostgreSQL adversarial CI passed. It permits one-time acknowledgement and has a fail-closed rollback that disables vendor acknowledgement. The migration was applied to the connected database on 18 October 2026; live readback confirms one BEFORE UPDATE guard trigger with protected receipt/tax fields and one-time acknowledgement.  
**Status:** Mitigated in the live database. PR #104 and its 35-check isolated PostgreSQL suite passed.

### SEC-2026-006 — Pending profiles have company membership; legacy company-scoped RLS policies do not require approval

**Severity:** High  
**Evidence from connected Supabase catalog:**
- All 156 ordinary public tables checked had RLS enabled. This is a useful base but does not guarantee a policy is restrictive enough.
- 54 tables had a company_scope% policy; 53 of those policy sets did not mention is_approved(auth.uid()).
- provision_user_abood_access() assigns newly created profiles Abood company membership with can_view=true and can_create=true, regardless of profile status.
- has_company_access() checks view membership but does not check approval status.
- The frontend route guard sends pending/rejected profiles to the pending screen, but direct API/database requests can bypass that UI. That makes frontend-only approval insufficient.

**Fix and verification:** PR #106 merged; the migration was applied to the connected database on 18 October 2026. Live readback confirms 155 approval gates across 156 RLS-enabled public tables, with profiles intentionally excluded so pending users can read their own status. Existing row-level role/company policies remain in place. The isolated PostgreSQL adversarial suite passed without rewriting business rows.

**Release status:** Applied and verified live. See rollout verification below; continue post-deployment smoke tests for approved roles and repeat the adversarial checks after future permission changes.

### SEC-2026-007 — Unused HR/AI governance tables expose broad company-only CRUD to authenticated members

**Severity:** High for HR lifecycle/performance data; Medium–High for AI governance/configuration data  
**Tables in scope:** ai_action_proposals, ai_alerts, ai_answer_evaluations, ai_context_bindings, ai_forecast_models, ai_skills, employee_leave_requests, employee_lifecycle_events, employee_performance_cycles, employee_training_records.

**Evidence:** The live pg_policies catalog shows only broad company_scope_select/insert/update/delete policies on these ten tables. They check company_id=current_company_id() and has_company_access(company_id) but do not enforce role or record ownership. The connected app source search found no operational callsites beyond the schema/migration/generated type layer, so no current approved workflow could be verified.

**Fix and verification:** PR #106 merged and applied live. Catalog readback confirms all ten tables have no direct anon/authenticated SELECT, INSERT, UPDATE or DELETE privileges and retain service_role access. Their broad company-only policies are removed; their data remains intact.

### SEC-2026-008 — Elevated RPC helper functions could bypass the profile-approval screen

**Severity:** High when a previously privileged profile is marked pending/rejected but its role assignment remains.  
**Evidence:** A catalog/source scan found 35 executable SECURITY DEFINER functions whose source did not mention is_approved(). Several correctly checked roles, but role checks alone do not confirm the profile is approved. SECURITY DEFINER operations can bypass RLS policies on the underlying tables; the global RESTRICTIVE table policy alone is therefore not sufficient for those function calls.  
**Fix and verification:** PR #106 merged and applied live. Catalog readback confirms all five shared helpers now check approval status. The isolated PostgreSQL suite verifies pending users with a lingering admin role cannot resolve an active company, pass role/company helpers, list roles, or switch company. Continue reviewing functions that mutate data outside these shared helpers.  
**Residual review:** Continue checking functions that perform mutations outside these shared helpers, anonymous/public endpoints and integrations; this is not a complete security certification.

### SEC-2026-009 — Profile INSERT policy allowed self-creation with a caller-chosen approval status

**Severity:** Medium–High; exploit requires a valid authenticated account whose profile row is missing, but that account could recreate the row as approved.  
**Evidence:** The live permissive INSERT policy allowed `public.has_role(auth.uid(),'admin') OR id=auth.uid()`. Normal signup already creates profiles through the SECURITY DEFINER trigger on `auth.users`, so the self-insert branch is not required by the application signup path. The profile status defaults to pending, but a direct self-insert can supply a different value if a profile row does not exist.  
**Fix and verification:** PR #107 merged after all CI jobs passed; its migration was applied live on 18 October 2026. Readback confirms the INSERT policy now requires the approved Admin role and the existing auth.users signup trigger remains present. The isolated PostgreSQL regression test verifies self-approval denial, non-admin provisioning denial and admin provisioning success.

### SEC-2026-011 — Vendor can update their supplier master record, including balance fields

**Severity:** High — an external vendor account could directly change supplier-master values used by the buyer's ERP.  
**Evidence:** The connected database has a permissive `sup_vendor_update_own` UPDATE policy on `public.suppliers` that permits vendors to update their linked supplier row. The table includes `opening_balance`, `current_balance`, `gstin`, name and contact fields. The live Vendor portal provides purchase-order review/acknowledgement and ledger viewing, but no supplier-master edit workflow. The RLS scope stops company/user reassignment, but it does not prevent a vendor from changing their own financial/profile fields.  
**Fix proposed in PR:** Drop only `sup_vendor_update_own`. Keep the existing vendor read policy and Admin/Production supplier maintenance policy. Add isolated PostgreSQL checks for vendor own-row balance/GST/contact changes, another vendor's row, cross-company scope, and continued staff maintenance. Do not deploy before the exact CI passes and live policy readback confirms the direct vendor UPDATE policy is absent.

### SEC-2026-010 — Excess non-row table privileges on public ERP tables

**Severity:** High potential blast-radius issue; exploitability depends on a separately available SQL/privileged execution path because ordinary Supabase REST does not itself provide TRUNCATE/DDL endpoints.  
**Evidence:** Before PR #106 deployment, live ACL readback showed anon and authenticated had explicit TRUNCATE, TRIGGER and REFERENCES privileges on many public tables, including invoices. RLS does not filter TRUNCATE and is not a boundary for trigger/constraint privileges.  
**Fix and verification:** PR #106's migration is live. Effective privilege checks now show zero anon/authenticated TRUNCATE, TRIGGER or REFERENCES privileges across all 156 public base tables. Normal row-level grants remain, and the migration preserves service_role maintenance privileges. CI verifies these privilege boundaries in a disposable database.

## Role and data-domain matrix (initial, not exhaustive)

| Domain | Expected authorization | Required negative tests |
|---|---|---|
| Accounting, vouchers, financial year, GST, bank | Admin/Accountant, with privileged close/reopen actions more narrowly admin-only; active company and approval | pending profile, Sales/Production/HR/Customer/Vendor direct API/RPC attempts; forged IDs; immutable posted transaction/reversal rules |
| Sales, invoices, customer records | Admin/Sales/Accountant per operation; customers limited to linked party and company | customer A vs B; Sales creator ownership; invoice-line parent checks; pagination/export/print |
| Inventory, purchases, receipts, supplier data | Role-specific company access; vendor restricted to their supplier and acknowledgement fields | supplier A vs B, cross-company IDs, price/tax/receipt status spoofing, duplicate/replay and trigger side effects |
| Production/MRP/BOM/quality/maintenance | Approved operational roles with per-company CRUD flags and parent-child checks | role CRUD matrix, wrong-company parent IDs, workflow state bypass and stock posting indirect effects |
| HR, attendance, payroll, lifecycle/performance | Admin/HR; employee self-access only to own allowed data | employee A vs B, salary/payslip reads, manager/team boundaries, approval state mutation, exports |
| AI, documents, proposals, audit/freshness | Approved analyst roles; conversation owner/company; admin-only review/audit where defined; AI should not post transactions | prompt injection, cross-company retrieval, unauthorized supplier documents, forged proposal ID, unauthorized approve/replay |
| Tally, backups, connectors, secrets | Admin-only and server-side, with import/cutover gates and audited access | pending/rejected user, direct RPC, company mismatch, archive download, secret leakage/error log, duplicate staging |
| Website enquiries | Anonymous create only through validated server endpoint; approved Admin/Sales read/update in active company | spam/rate limit, oversized payload, cross-company read, anonymous table write bypass and PII leakage |

## What is not yet proven

- Every server function, route handler, SQL RPC, trigger, view and SECURITY DEFINER function has not yet been mapped to all roles, parents and tables.
- All storage buckets and realtime publication/policies have not yet been exhaustively read back.
- Complete server-side runtime secret handling and deployment of the public custom domain have not been independently proven in this audit.
- SoD controls for supplier maintenance vs. receipt/payment, payroll changes vs. approval, and voucher preparation vs. period reopening have not been confirmed end-to-end.
- Browser-visible navigation and the complete website→enquiry→ERP and customer order→payment→fulfilment journeys still require direct end-to-end smoke tests.

## Rollout verification and fail-closed rollback

Before the database migration is applied:
1. Preserve the current definitions of current_company_id(), has_company_access(), has_role(), current_user_roles(), set_active_company(), and the current policy list as a read-only deployment record.
2. Confirm CI is green for the exact head commit and that no production rows are included in the disposable test fixture.
3. Apply the approval-gate migration as one transaction; it changes helper/policy definitions and grants, not business rows.
4. Read back the count of RLS-protected public tables, the number with approved_profile_required (all except profiles), the five helper definitions, and privileges/policies for the ten disabled HR/AI tables.
5. Confirm pending users can still read only their own profile status; confirm approved roles can access their usual active-company pages; verify direct API/RPC denial for pending profiles and that service_role retains explicit privileges for server maintenance.
6. Smoke-test key approved-role workflows: company switch, dashboard, invoices/accounting for Admin/Accountant, sales orders for Sales, production for Production, employee/payslip views for HR/Employee, customer-owned order/invoice pages, vendor-owned purchase-order acknowledgement and Admin settings.

**Rollback principle:** this is a security-tightening migration; do not drop approved_profile_required, restore old company-only HR/AI CRUD policies, or grant the ten locked tables back to authenticated/public clients as an emergency workaround. It changes no business records. If an approved workflow regresses, keep the access boundary in place, temporarily disable the affected UI/API workflow, capture the failing role+route and database error, and ship a forward-compatible policy/helper correction with an adversarial regression test. A migration that restores the old access is not an acceptable rollback.

## Release discipline

No live database migration is authorized by this report. All security migrations must first pass disposable PostgreSQL adversarial tests. Never weaken accounting, inventory or company-isolation rules to pass CI. Keep live checkout disabled until authoritative product/price/tax, stock, order persistence, webhook validation/idempotency, reconciliation, delivery and fulfilment are complete. Mark a finding “fixed” only after the commit is integrated, CI passes, deployed policy/function definitions are read back, and the real intended workflow plus negative authorization cases are re-tested.


## Next iterative cycle — 18 October 2026, 20:33 IST

### SEC-2026-012 — Sensitive enterprise finance tables lack a database role gate for reads

**Severity:** High (source-level authorization gap; deployment status unverified).  
**Evidence:** The source migration `20261014143000_harden_enterprise_domain_permissions.sql` creates permissive read policies for additive-domain records using approval, active-company and `can_view` membership checks, but no domain role check. The separate `20261014140000_enterprise_workbench_admin_dml_guard.sql` restricts writes on `budgets`, `bank_reconciliations` and `fixed_assets`, but deliberately leaves reads unchanged. The frontend route policy for `/banking` admits Admin/Accountant only. A user with generic company-view membership but no finance role can therefore bypass the frontend and may read these tables directly if these source policies are deployed together.

**Fix proposed:** Add restrictive `enterprise_finance_role_guard` policies to `budgets`, `bank_reconciliations` and `fixed_assets`, requiring approved Admin or Accountant, active-company match and company access. Restrictive policies AND with existing company/CRUD policies; they grant no new table privileges. The migration fails rather than silently skipping an expected table or `company_id` column.

**Regression coverage:** New disposable-PostgreSQL harness tests Admin/Accountant allow, Sales/Production/HR/Employee/Customer/Vendor denial, pending-profile denial, company A/B row isolation and unauthorized CRUD attempts. CI job is added in the proposed PR. Do not mark fixed until CI passes and the migration is applied to the confirmed ERP database with catalog readback and approved-role smoke tests.

### SEC-2026-013 — Supabase connection/configuration mismatch blocks trustworthy live verification

**Severity:** High operational/security verification blocker; not proof of a data breach.  
**Evidence:** The tracked root `.env` contains only Supabase URL/project identifiers and legacy anon/publishable client keys (no service-role, password, Razorpay or other private-secret variable names were found). Its project identifier and URL do not match the Supabase project available through the current connected database tool. That connected database exposes only `public.tally_archive_uploads` as a public application table and three public functions, whereas this repository's ERP migrations and types expect profiles, company access, accounting, sales, inventory, production and HR tables. The connected project has a private `tally-archives` bucket. Do not apply ERP schema/authorization migrations to this mismatched target.

**Action required:** Resolve which Supabase project the deployed Lovable app actually uses; verify the project reference and URL in the hosting environment without sharing key values. Then rerun catalog/grant/policy/function/storage audits against that confirmed target. The tracked `.env` is a hygiene concern and should be removed from version control only after CI/build and hosting environment variables are proven independent of it.

### SEC-2026-014 — Connected archive database retains excess non-row privileges and has an RLS performance warning

**Severity:** Medium; applies only to the currently connected database, which is not yet proven to be the live ERP database.  
**Evidence:** Live ACL readback for `public.tally_archive_uploads` shows `authenticated` still has effective `TRUNCATE`, `REFERENCES` and `TRIGGER` privileges. Its owner SELECT/INSERT/DELETE policies call `auth.uid()` directly, and the Supabase performance advisor reports three `auth_rls_initplan` warnings for those policies. The security advisor returned no lints, but that does not override the explicit ACL readback.

**Action:** Keep the migration unapplied until project ownership is confirmed. In the correct target, revoke unnecessary non-row privileges and optimize owner policies with scalar subqueries such as `(select auth.uid())`, then verify grants and policy expressions. Do not infer that RLS makes `TRUNCATE` safe.

## 2026-10-24 iterative audit addendum

**Scope:** Current source files fetched from `main`; all nine open PRs listed by the connected GitHub search; read-only catalog, grants, RLS, migration-ledger and Supabase-advisor inspection of connected project `ibnacjirwnhbtqrirdsz`; no production writes or deployments.

### SEC-2026-010 — Tally archive access is owner-scoped but not approved-Admin-scoped; excess table ACLs

**Severity:** High review priority.  
**Evidence:** In connected project `ibnacjirwnhbtqrirdsz`, `public.tally_archive_uploads` has RLS enabled and zero rows. Its SELECT/INSERT/DELETE policies restrict the caller to their own `user_id`, but do not require an approved Admin role. The private `tally-archives` Storage policies similarly require only an owner-folder match. The bucket is private with a 500 MiB configured size limit. The live table ACL also grants `authenticated` UPDATE, TRUNCATE, TRIGGER and REFERENCES in addition to SELECT/INSERT/DELETE. RLS does not constrain TRUNCATE; the ACL excess is confirmed, while exploitation through an ordinary REST request was not demonstrated. Supabase's security advisor returned no lints; its performance advisor reported three RLS init-plan warnings and one unused-index notice.

**Target identity caveat:** Repository `supabase/config.toml` identifies `ysaocrumxikgywdotkne`, while both connected account links expose `ibnacjirwnhbtqrirdsz`. The latter has seven migrations and only one public application table, so it is not a verified match for the full ERP schema. Do not attribute its live findings to the published website until the deployed backend is identified.

**Fix proposed:** Existing PR #35 now contains additive migration `20261024090000_harden_tally_archive_access.sql`, which adds an identity-bound SECURITY DEFINER helper with fixed `search_path`, revokes all browser/API table privileges before granting only SELECT/INSERT/DELETE, and requires approved Admin plus owner-folder/row scope for archive registry and Storage operations. The PR also adds `security-tests/tally_archive_access.py` and a disposable-PostgreSQL CI job covering approved Admin, Sales, pending Admin, forged identity/path, UPDATE/TRUNCATE denial, and function execute privileges.

**Validation status:** The patch was committed to the existing PR #35 branch; a successful CI run for the new job was not visible through the connected workflow-run/status query at audit time. A current comparison shows that branch is 31 commits ahead and 214 behind `main`; PR #35 remains draft and must be cleanly updated/rebased before merge. The workflow file was aligned with main's current security jobs plus the archive test job, but no successful run was verified. No hosted migration was applied. Treat the fix as proposed, not verified or deployed.

### SEC-2026-011 — Canonical accounting/inventory migration chain still fails replay validation

**Severity:** High release blocker.  
**Evidence:** The current `main` source for `supabase/migrations/20261005180000_final_production_alignment.sql` contains 42 `$function$` delimiters across 21 function definitions; all 21 closing delimiters inspected lack the required statement-terminating semicolon. This is a source-level syntax defect. The preceding production-hardening migration references `public.bill_allocations` before its definition appears in the authoritative Supabase migration sequence; PR #127 proposes to repair that missing schema. An earlier dedicated replay workflow failed, and no successful full clean replay of the current main tree was verified in this cycle.

**Required verification:** Correct the function statement terminators and authoritative migration order, then replay the full chain from an empty disposable Supabase environment. Run accounting, inventory, company-isolation, idempotency and authorization tests and review rollback before any deployment. No accounting/inventory migration was changed in this cycle.

### SEC-2026-012 — Published-domain and live checkout behavior remain unverified

**Severity:** Release readiness blocker, not a confirmed website outage.  
**Evidence:** Direct web inspection of `https://www.zizzmattress.com` was inaccessible through the available inspection path. The repository's manual production-smoke workflow checks the Lovable-hosted ERP login checkpoint rather than proving the public Zizz domain, catalogue, contact form, checkout or shipping flow works. This is an evidence gap, not proof that the site is down.

**Disposition:** Keep real payments and live checkout disabled until authoritative variants/prices/tax, persistent order snapshots, inventory reservation, payment signature/idempotency, shipping/serviceability, reconciliation and fulfilment are verified together. Velocity rate/serviceability support alone is not complete shipment fulfilment.

### SEC-2026-013 — Current CI and deployment evidence not sufficient for certification

**Evidence:** The connected GitHub combined-status and commit-workflow-run queries returned no status contexts/runs for the inspected main/feature commits. This does not prove CI did not run; it means this audit could not independently confirm a current passing run. No production smoke run was verified. The route → role → server function/API → SQL RPC → table/storage policy → adversarial test inventory remains incomplete.

**Residual risk:** No complete deployed-backend catalog readback, full endpoint/RPC adversarial pass, backup-restore exercise, or public ecommerce end-to-end test was completed in this cycle. The connected database identity must be resolved before applying any live remediation.

### SEC-2026-014 — Velocity secret/runtime binding and fulfilment remain unverified

**Severity:** Medium integration-readiness risk; not a confirmed credential exposure.  
**Evidence:** The tracked `.env` contains project identifiers, Supabase URL and publishable client keys; no server-side Velocity, Razorpay secret, or Supabase service-role key was found in that file. The server-only Velocity client reads `process.env.VELOCITY_API_KEY`, uses a fixed provider origin, restricts endpoints to serviceability/rates, disables redirects, caps response size, and discards provider error bodies. Server functions call authentication middleware and an approved-Admin check before provider calls. The connected Supabase project has no deployed Edge Functions, one public application table, and no reported realtime publication rows; it is not a verified match for the repository's configured ERP backend.

**Runtime caveat:** The owner reports adding `VELOCITY_API_KEY` to the existing Lovable project's Secrets. The connected tools cannot read secret values or prove that the published website runtime is bound to that project/revision. The repository's older integration note was updated to reflect the report without claiming successful authentication.

**Residual risk:** The current client implements only serviceability/rate queries. Shipment booking, tracking/status synchronization, return fulfilment, and an end-to-end website order → paid/eligible order → serviceable destination → shipment → reconciliation workflow are not implemented/verified in the reviewed code. No live Velocity request was made and no shipment was created. Keep live checkout/payment and shipment creation disabled until a controlled provider request and the complete order/fulfilment workflow pass.
