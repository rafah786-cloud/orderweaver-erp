# Security audit register — 18 October 2026

**Repository baseline:** main 79248ccd41917d631194fc628a3b24296e9b8359  
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
**Fix proposed:** PR #104 replaces the guard, permits a one-time accept/reject transition, uses server-generated acknowledgement timestamps, adds adversarial PostgreSQL coverage and a fail-closed rollback that disables vendor acknowledgement.  
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

## Release discipline

No live database migration is authorized by this report. All security migrations must first pass disposable PostgreSQL adversarial tests. Never weaken accounting, inventory or company-isolation rules to pass CI. Keep live checkout disabled until authoritative product/price/tax, stock, order persistence, webhook validation/idempotency, reconciliation, delivery and fulfilment are complete. Mark a finding “fixed” only after the commit is integrated, CI passes, deployed policy/function definitions are read back, and the real intended workflow plus negative authorization cases are re-tested.
