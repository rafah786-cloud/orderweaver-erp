## Open tasks

- [x] Verify and publish Ask your data history, retrieval failure and company-attribution safeguards with regression tests
- [x] Review wider AI/ERP audit evidence and implement independently safe high-impact fixes
  - [x] Company-isolate AI conversation history with active-company RLS and server-side company binding
  - [x] Harden document extraction against prompt injection by treating document content as untrusted data
  - [x] Route enterprise workbench mutations through authenticated server-side authorization
  - [x] Make enterprise-domain audit logging atomic with database triggers
  - [x] Allow AI mattress recommendations to use released PLM BOM revisions when legacy model_boq is absent
  - [x] Add regression coverage for the above safeguards

- [x] Add OAuth-protected agent integrations with read-only account and recent-invoice tools; republish to activate the new connection catalog
- [x] Add Tally Connect as an admin-only dashboard action linking to its separate signed-in app
- [x] Resolve the reported publishing build failure: latest build signal is OK; preview responds successfully
- [x] Make Tally accounting uploads fail closed and display voucher-line control totals and integrity issues without saving incomplete accounting data
- [x] Canonical bill-wise model implemented in repository with invoice-linked bills, party-ledger resolution, receipt allocation, reversal and idempotency paths
- [x] AI layer: routes, sidebar/permissions, contextual buttons, working NVIDIA models, verified Ask Maestro + document extraction against live data
- [~] Tally full accounting migration: safe staging control plane, lifecycle preservation, validation and reconciliation UI are implemented; canonical historical commit still requires the real Tally export/source identifiers and final accountant-approved control totals. Repository-side hardening is complete; the remaining gate is source/accountant dependent.
- [~] Execute the audited TallyPrime-retirement remediation and cutover plan — all repository-side/database-control phases are hardened; the final historical cutover remains gated on source-supported opening valuation, financial-year mapping, accountant-approved reconciliation and live operational dress rehearsal.
  - [x] Phase 1 Accounting Foundation implemented as an isolated migration and fixture suite
  - [x] PostgreSQL integration/concurrency tests completed in disposable isolated database with synthetic fixtures
  - [x] Durable fail-closed Phase 1 database harness, fixtures, preflight, direct-write audit, and managed-security checks committed
  - [x] Harden managed validation runners to require an explicit non-production TEST identity before mutating SQL
  - [x] Replace manual voucher and number-series client writes with the authenticated atomic posting path
  - [x] Production Phase 1/2 promotion, preflight, validation and reconciliation against existing live records
  - [x] Phase 2 canonical bill-wise receivable/payable repository model and isolated tests
  - [x] Phase 3 stock ledger hardening: immutable movements, weighted-average issues, valued transfers and reversal safety prepared
  - [x] Phase 3 production integration functions prepared for BOM consumption, finished-goods receipt and dispatch using mapped stock items
  - [~] Phase 3 opening stock valuation: migration staging preserves Tally opening quantity/rate; actual opening valuation remains source-dependent and will stay quantity-only where Tally provides no value
  - [x] Phase 3 accounting integration: canonical posting functions installed and live-tested without rewriting historical records
  - [x] Managed/live database integration tests and security/grant verification
- [x] Premium ERP UI redesign: flagship Zizz homepage, brand portfolio, shared shell/components, responsive verification
- [x] Public Zizz homepage redesign: ecommerce-first navigation, sleep-discovery sections, custom mattress journey, brand portfolio and mobile-first conversion layout
- [x] Reverse mattress specification costing: ERP-matched raw materials and rates, fixed internal labour/profit policy, no displayed calculation breakdown, refusal on missing/ambiguous quantities, units or prices
- [x] Ecommerce-ready storefront shell: product discovery, search/cart/wishlist affordances and catalog-safe placeholders without inventing product prices or stock
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
- [x] Add company/group consolidated reporting and controlled inter-company transactions
- [x] Do not install accounting/inventory SQL until production compatibility, recovery and database-level validation requirements are satisfied

## 2026-10-05 direct live hardening checkpoint

- Canonical accounting/inventory/company-boundary functions were installed directly into the live database without using the Lovable agent credits.
- Non-destructive live transaction tests passed for invoice posting, bill creation, partial receipt, idempotent receipt retry, receipt reversal, purchase receipt, payable voucher balancing and stock receipt; all tests were wrapped in transactions and rolled back.
- A final migration mirror was committed at `supabase/migrations/20261005180000_final_production_alignment.sql` so the live hardening is reproducible from source.
- Published project was redeployed from commit `3cf6b3d90a0c9c4f146d6c637e40ee5924d4993f` and the project reports ready with no build error.

## 2026-10-04 repository engineering checkpoint

- No production database writes were performed from this repository session.
- Prepared accounting/inventory SQL was not installed by this repository session.
- Inventory and accounting SQL still require database-level integration tests against the actual live schema before installation.
- Tally opening-stock valuation is intentionally not invented; it must come from Tally/source records.
- Production finished-goods valuation is intentionally blocked unless the mapped finished-good stock item has a positive valuation rate.
- The repository connection can modify GitHub source, but it does not provide a privileged live PostgreSQL/Supabase session; live reconciliation and production migration cannot truthfully be marked PASS from GitHub alone.

## 2026-10-05 remaining-work status

- Trial Balance, Profit & Loss and Balance Sheet now support explicit date ranges and server-side period-aware ledger calculations.
- Voucher lifecycle now has explicit posted/reversed/cancelled state metadata without changing existing historical voucher amounts.

- Safe Tally migration control plane is live: append-only run metadata, staged source payloads, lifecycle states, validation issues and reconciliation snapshots.
- The migration UI can stage a parsed Tally snapshot without posting anything into canonical ERP books, then validate source voucher balance/duplicate/stability controls.
- A read-only consolidated trial-balance function/report now spans companies the signed-in user is authorized to view.
- Controlled inter-company journal posting is available to administrators with access to both companies; source and target vouchers are linked by a single transaction/idempotency key.
- The only remaining Tally migration gate is the real source export and accountant-approved reconciliation/cutover. This cannot be completed truthfully without the company's actual Tally data and operational dress rehearsals.

## 2026-10-06 four-company access workflow

- [x] Four company books provisioned: ABOOD TRADINGS, ABRAZ SLEEPING SOLUTIONS, ABOOD TRADINGS - MANAGEMENT BOOKS, ABRAZ SLEEPING SOLUTIONS - MANAGEMENT BOOKS.
- [x] Self-registration has no company selector; new profiles default to ABOOD TRADINGS.
- [x] Existing users have been reset to ABOOD TRADINGS as their default/initial company access.
- [x] Admin approval now includes multi-select company access and approval saves the selected access before approving.
- [x] Admin company access is enforced server-side through a SECURITY DEFINER assignment function; ABOOD remains the default landing company.

- [x] Tally Import now requires an explicit administrator-selected target company for every XML staging run, reducing the risk of cross-company data mixing.
- [x] Four-book setup is aligned for separate imports: ABOOD TRADINGS, ABRAZ SLEEPING SOLUTIONS, and two clearly labeled management/internal books.

## 2026-10-08 global ERP capability audit

- [x] Audited current navigation, permissions, public database tables/functions and major ERP domains against SAP S/4HANA, Microsoft Dynamics 365, Oracle NetSuite, Odoo 19 and ERPNext.
- [x] Documented missing first-class domains and cross-module requirements in `docs/GLOBAL_ERP_CAPABILITY_GAP_AUDIT_2026-10-08.md`.
- [ ] Manufacturing MPS/MRP, capacity, routing, scheduling and shop-floor execution.
- [ ] Quality management and CAPA.
- [ ] Maintenance and asset management.
- [ ] Engineering PLM/ECO/BOM revision control.
- [ ] Advanced warehouse execution and landed cost.
- [ ] Full sourcing/RFQ/supplier-performance/3-way-match procurement.
- [ ] CRM, quotations, returns/RMA and logistics/fulfilment.
- [ ] Fixed assets, budgeting, cash-flow forecasting and month-end close management.
- [ ] HR expansion and project/contract management.
- [ ] AI 2.0: freshness, evidence drill-down, proactive intelligence, contextual assistance and governed actions.
- [ ] Platform workflow engine, master-data governance, observability, API/webhooks and disaster-recovery verification.
