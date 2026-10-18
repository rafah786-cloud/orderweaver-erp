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
**Fix proposed:** The guard hardening was merged to main in PR #104 after isolated PostgreSQL adversarial CI passed. It permits one-time acknowledgement and has a fail-closed rollback that disables vendor acknowledgement. The migration still needs a safe production deployment and live trigger readback.  
**Status:** Code is proposed; do not assume production database is fixed until migration is reviewed/applied and live trigger readback confirms it.

### SEC-2026-006 — Pending profiles have company membership; legacy company-scoped RLS policies do not require approval

**Severity:** High  
**Evidence from connected Supabase catalog:**
- All 156 ordinary public tables checked had RLS enabled. This is a useful base but does not guarantee a policy is restrictive enough.
- 54 tables had a company_scope% policy; 53 of those policy sets did not mention is_approved(auth.uid()).
- provision_user_abood_access() assigns newly created profiles Abood company membership with can_view=true and can_create=true, regardless of profile status.
- has_company_access() checks view membership but does not check approval status.
- The frontend route guard sends pending/rejected profiles to the pending screen, but direct API/database requests can bypass that UI. That makes frontend-only approval insufficient.

**Fix proposed in PR:** Add a RESTRICTIVE approved_profile_required policy to all RLS-enabled public tables for authenticated, requiring public.is_approved(auth.uid()). The profiles table is intentionally excluded because a pending user must be able to read their own status. Restrictive policies are ANDed with existing policies; this must not replace each table's role/company policy. Add isolated PostgreSQL tests for pending denial, own-profile status read, approved access, company isolation, and preserved service-role access.

**Release status:** Migration is proposed only. Do not run it in production until the disposable-database adversarial suite passes, app flows are reviewed, and post-deploy readback/rollback are planned.

### SEC-2026-007 — Unused HR/AI governance tables expose broad company-only CRUD to authenticated members

**Severity:** High for HR lifecycle/performance data; Medium–High for AI governance/configuration data  
**Tables in scope:** ai_action_proposals, ai_alerts, ai_answer_evaluations, ai_context_bindings, ai_forecast_models, ai_skills, employee_leave_requests, employee_lifecycle_events, employee_performance_cycles, employee_training_records.

**Evidence:** The live pg_policies catalog shows only broad company_scope_select/insert/update/delete policies on these ten tables. They check company_id=current_company_id() and has_company_access(company_id) but do not enforce role or record ownership. The connected app source search found no operational callsites beyond the schema/migration/generated type layer, so no current approved workflow could be verified.

**Fix proposed in PR:** Remove broad company-only policies and revoke direct PUBLIC, anon and authenticated table privileges for these ten tables until each has a documented role/record-owner workflow and adversarial tests. Preserve data and existing service_role privileges. This is intentionally fail-closed: these capabilities are not to be exposed directly to client users before policy and functional coverage is ready.

### SEC-2026-008 — Elevated RPC helper functions could bypass the profile-approval screen

**Severity:** High when a previously privileged profile is marked pending/rejected but its role assignment remains.  
**Evidence:** A catalog/source scan found 35 executable SECURITY DEFINER functions whose source did not mention is_approved(). Several correctly checked roles, but role checks alone do not confirm the profile is approved. SECURITY DEFINER operations can bypass RLS policies on the underlying tables; the global RESTRICTIVE table policy alone is therefore not sufficient for those function calls.  
**Fix proposed in PR:** Harden current_company_id(), has_company_access(), has_role(), current_user_roles(), and set_active_company() to require an approved profile. Add disposable-PostgreSQL tests proving a pending profile with a lingering admin role and company membership cannot resolve an active company, pass role/company helper checks, list its roles, or switch company; approved users retain the existing helper behavior. Other role-checked SECURITY DEFINER functions inherit the stricter shared helper decisions.  
**Residual review:** Continue checking functions that perform mutations without these shared helper checks, anonymous/public endpoints and service integrations; do not treat the helper update as complete audit coverage.

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
