# Security Matrix — Source-only, Incomplete Draft

> **LIVE DATABASE: UNVERIFIED.** No live database was accessed. `Yes (source)` records a migration declaration only. Unknown is not a pass. The repo has 117 Supabase CLI migration files; the earlier review sampled definitions rather than tracing every statement in all files. This draft does not yet meet the requested exhaustive one-row-per-table coverage; grouped/unknown rows are explicit work items, not proof of safety.

| Table | Defining migration | RLS enabled | Company scope | Branch scope | Audit coverage | Approval enforcement | Gaps |
|---|---|---|---|---|---|---|---|
| profiles | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Unknown | Trace final approved-profile and self-insert policies. |
| user_roles | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Partial | Partial/unknown | Unknown | Partial/unknown | Test self-grant and cross-company/branch escalation. |
| parties | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Partial/unknown | Check child records and linked supplier/customer data. |
| sales_orders | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Partial | Unknown | Partial/unknown | Partial; selected guards | Test direct DML and linked stock/invoice/dispatch. |
| sales_order_items | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Unknown; parent scope | Unknown | Unknown | Unknown | Verify parent ownership and direct grants. |
| invoices | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Partial | Unknown | Partial | Partial; atomic creation/finance guards | Trace all invoice families, lines and external sync. |
| invoice_items | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Unknown; parent scope | Unknown | Unknown | Unknown | Verify parent company and direct DML. |
| production_orders | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Partial | Unknown | Partial/unknown | Partial; transition guards | Verify material/output/serial relationships. |
| employees | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Partial; HR scope migration | Partial/unknown | Unknown | Unknown | Protect payroll and sensitive employee fields. |
| attendance | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Unknown | Check device provenance and corrections. |
| payslips | 20260529114415_8d242d2a-efbc-4ed7-823e-0fd766c0e314.sql | Yes (source) | Unknown | Unknown | Unknown | Partial/unknown | Verify self-read, HR/accountant roles and exports. |
| device_settings | 20260529133536_fdbc4739-dfe3-4c55-bc4d-ed220613db1a.sql | Yes (source) | Unknown; later biometric scope | Unknown | Unknown | Unknown | Trace final company predicate. |
| shift_settings | 20260529133536_fdbc4739-dfe3-4c55-bc4d-ed220613db1a.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Unknown | Check final restrictive policies. |
| punch_events | 20260529133536_fdbc4739-dfe3-4c55-bc4d-ed220613db1a.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Unknown | Restrict raw biometric data and ingestion edits. |
| e_way_bills | 20260530120207_0c75cdc9-252e-434d-84d8-8af10420f4c3.sql | Yes (source) | Unknown | Unknown | Unknown | Unknown | Verify statutory immutability and export roles. |
| raw_materials | 20260530172034_c6a3232c-dd1c-4ec9-b182-ba0e7ff2cc7b.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Unknown | Trace company/warehouse scope. |
| suppliers | 20260530172034_c6a3232c-dd1c-4ec9-b182-ba0e7ff2cc7b.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Partial/unknown | Verify later supplier update restrictions. |
| purchase_bills | 20260530172034_c6a3232c-dd1c-4ec9-b182-ba0e7ff2cc7b.sql | Yes (source) | Partial/unknown | Unknown | Partial/unknown | Partial; matching/vendor guards | Test vendor/internal role separation and PO/GRN links. |
| purchase_bill_items | 20260530172034_c6a3232c-dd1c-4ec9-b182-ba0e7ff2cc7b.sql | Yes (source) | Unknown; parent scope | Unknown | Unknown | Partial/unknown | Verify parent company guard. |
| product_models | 20260530172034_c6a3232c-dd1c-4ec9-b182-ba0e7ff2cc7b.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Partial; ECO governance | Trace model/BOM release. |
| model_boq | 20260530172034_c6a3232c-dd1c-4ec9-b182-ba0e7ff2cc7b.sql | Yes (source) | Unknown | Unknown | Unknown | Partial/unknown | Check released BOM immutability. |
| party_ledger_entries | 20260602173547_827ce3ee-5633-4d47-8413-a40093f9dbeb.sql | Yes (source) | Unknown | Unknown | Partial/unknown | Partial; posting guards | Verify ledger/voucher links and immutability. |
| supplier_ledger_entries | 20260602173547_827ce3ee-5633-4d47-8413-a40093f9dbeb.sql | Yes (source) | Unknown | Unknown | Partial/unknown | Partial; posting guards | Verify supplier/company and direct writes. |
| ledger_groups | 20260603072743_2acbd10d-af50-4f29-b5da-2ef80b73b9f0.sql | Yes (source) | Unknown | Unknown | Unknown | Unknown | Confirm global vs tenant chart semantics. |
| ledger_accounts | 20260603072743_2acbd10d-af50-4f29-b5da-2ef80b73b9f0.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Partial; posting constraints | Verify company ownership and protected accounts. |
| cost_centers | 20260603072743_2acbd10d-af50-4f29-b5da-2ef80b73b9f0.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Unknown | Verify company/department isolation. |
| financial_years | 20260603072743_2acbd10d-af50-4f29-b5da-2ef80b73b9f0.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Partial; FY guard | Verify closed-year writes. |
| voucher_number_series | 20260603072743_2acbd10d-af50-4f29-b5da-2ef80b73b9f0.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Partial; guarded numbering | Preserve existing semantics before generic series. |
| vouchers | 20260603072743_2acbd10d-af50-4f29-b5da-2ef80b73b9f0.sql | Yes (source) | Partial; multi-company/FY controls | Unknown | Partial; voucher audit sink | Partial; posting/approval guards | Test edit-after-approval and reversals. |
| voucher_entries | 20260603072743_2acbd10d-af50-4f29-b5da-2ef80b73b9f0.sql | Yes (source) | Unknown; parent scope | Unknown | Partial/unknown | Partial; posting engine | Verify parent company and direct writes. |
| hsn_codes | 20260603104804_b3cefec5-3a87-4d51-9306-b794076b87cd.sql | Yes (source) | Unknown; shared scope unconfirmed | Unknown | Unknown | Unknown | Decide shared vs company-owned. |
| gst_rate_changes | 20260603104804_b3cefec5-3a87-4d51-9306-b794076b87cd.sql | Yes (source) | Unknown | Unknown | Unknown | Unknown | Verify effective dates and audit. |
| gst_returns | 20260603104804_b3cefec5-3a87-4d51-9306-b794076b87cd.sql | Yes (source) | Unknown | Unknown | Unknown | Partial/unknown | Verify statutory filing approvals. |
| e_invoices | 20260603104804_b3cefec5-3a87-4d51-9306-b794076b87cd.sql | Yes (source) | Unknown | Unknown | Unknown | Partial/unknown | Verify external responses and statutory controls. |
| godowns | 20260603105531_74823777-a318-48ea-bf99-33e38de47447.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Unknown | Verify branch and movement scope. |
| stock_items | 20260603105531_74823777-a318-48ea-bf99-33e38de47447.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Unknown | Trace inventory grants and hardening. |
| stock_batches | 20260603105531_74823777-a318-48ea-bf99-33e38de47447.sql | Yes (source) | Unknown | Unknown | Unknown | Partial/unknown | Verify item ownership and batch lifecycle. |
| stock_movements | 20260603105531_74823777-a318-48ea-bf99-33e38de47447.sql | Yes (source) | Partial/unknown | Unknown | Partial/unknown | Partial; posting hardening | Test direct-write denial. |
| stock_journals | 20260603105531_74823777-a318-48ea-bf99-33e38de47447.sql | Yes (source) | Partial; later boundary | Unknown | Partial/unknown | Partial; atomic posting | Verify journal/line company integrity. |
| stock_journal_entries | 20260603105531_74823777-a318-48ea-bf99-33e38de47447.sql | Yes (source) | Partial; later boundary | Unknown | Partial/unknown | Partial; atomic posting | Verify parent ownership/direct writes. |
| stock_valuation_settings | 20260603105531_74823777-a318-48ea-bf99-33e38de47447.sql | Yes (source) | Unknown | Unknown | Unknown | Unknown | Restrict valuation changes. |
| currencies | 20260603121341_ef7729da-ee22-4b1e-affa-14d5bff7845a.sql | Yes (source) | Unknown; shared scope unconfirmed | Unknown | Unknown | Unknown | Confirm global/tenant semantics. |
| exchange_rates | 20260603121341_ef7729da-ee22-4b1e-affa-14d5bff7845a.sql | Yes (source) | Unknown | Unknown | Unknown | Unknown | Audit manual overrides and provenance. |
| bank_accounts | 20260603121341_ef7729da-ee22-4b1e-affa-14d5bff7845a.sql | Yes (source) | Partial/unknown | Unknown | Partial/unknown | Partial; reconciliation | Verify sensitive data and payout roles. |
| bank_transactions | 20260603121341_ef7729da-ee22-4b1e-affa-14d5bff7845a.sql | Yes (source) | Partial/unknown | Unknown | Partial/unknown | Partial; reconciliation guards | Verify imported source and matching integrity. |
| cheques | 20260603121341_ef7729da-ee22-4b1e-affa-14d5bff7845a.sql | Yes (source) | Partial/unknown | Unknown | Unknown | Partial/unknown | Verify issue/clear/void controls. |
| voucher_audit_log | 20260603122231_5faba150-7da9-449c-a794-a0141b00d561.sql | Yes (source) | Partial/unknown | Unknown | Yes, voucher-only | N/A/partial | Does not prove universal logging. |
| companies | 20261004123000_multi_company_foundation.sql | Yes (source) | Tenant root | Unknown | Unknown | Partial; company creation guard | Verify privileged RPC grants. |
| user_company_access | 20261004123000_multi_company_foundation.sql | Yes (source) | Core boundary | Unknown | Unknown | Partial; approved-book flow | Test unauthorized membership changes. |
| ai_conversations | 20261008200000_ai_conversation_company_isolation.sql | Yes (source) | Partial; active-company/owner | Unknown | Partial/unknown | N/A | Verify message-child policies. |
| marketing_creatives | 20261018210000_ai_marketing_creative_studio.sql | Yes (source) | Partial; membership/folder checks | Unknown | Partial/unknown | Partial; creative approval | Verify publish endpoints and storage bucket. |
| remaining tables in global ERP, AI/HR, marketing, fleet, shipment, quality and maintenance migration families | Multiple; exact per-table defining files not yet inventoried | Unknown | Unknown | Unknown | Unknown | Unknown | Must be expanded to one row per table; this row is a tracking marker, not table-level evidence. |

## Must finish before this can be called exhaustive

Enumerate every table created/altered by all 117 migrations, including dynamic SQL; split the final grouped tracking row; trace final RLS, policy, grants, triggers and approval guard per table in migration order; add file/line evidence. Test in a disposable staging project with cross-company, cross-branch and role adversarial cases. Live state remains unverified.
