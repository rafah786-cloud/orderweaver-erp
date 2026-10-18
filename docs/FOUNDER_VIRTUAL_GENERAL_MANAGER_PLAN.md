# Founder & CEO Operating Environment — Delivery Plan

**Purpose:** Evolve the existing Mattress Maestro ERP into a governed, AI-assisted operating environment for the Founder/CEO of Abood Tradings / Zizz Mattress and the future Zizz Smart Sleep Technologies LLP. This is an implementation contract, not a claim that the work is complete.

## Product outcome

The CEO should be able to open one command centre and answer: What needs my attention today? Are sales, cash, receivables, margins, inventory, production, procurement, delivery and people on plan? What is at risk, why, what evidence supports the finding, who owns the next action, and what decision requires my approval?

The AI general manager must behave as a decision-support and workflow coordinator. It must show source evidence and freshness, distinguish actuals from calculations/forecasts/interpretation, propose actions, and require human approval before consequential changes. It must never silently post accounting, inventory, payroll, purchasing, or customer-facing transactions.

## Operating model / domains

1. **CEO command centre:** cross-company switch with explicit company context; KPI scorecard; daily/weekly brief; exceptions, overdue work, approvals, owners, due dates, source drill-down and freshness indicators.
2. **Sales & customer growth:** leads/opportunities, quotation versions and approvals, customer-specific pricing, credit controls, order promising, order status, partial deliveries/backorders, returns/RMA, customer service and customer 360.
3. **Finance & cash:** cash position, receivable/payable ageing, collection promises, cash-flow and working-capital forecast, budgets vs actual, cost-centre and customer/product/channel profitability, fixed assets/depreciation, close checklist and management pack.
4. **Manufacturing planning & execution:** mattress-specific routing (foam cutting, spring work, quilting, taping, assembly, QC, packing), MPS/MRP, material commitments, work centres, capacity, scheduling, job cards, WIP, downtime/OEE, rework/scrap and standard-vs-actual variance.
5. **Quality:** incoming/in-process/final inspection plans, specifications, non-conformance, quarantine/release, defect/root-cause tracking, CAPA, supplier quality and finished-product traceability.
6. **Maintenance & assets:** asset register, PM schedules, breakdowns/work orders, spare parts, downtime, MTBF/MTTR, calibration and production-conflict warnings.
7. **Product engineering / PLM:** versioned BOMs, effective dates, ECO impact/approval/release, obsolete-component controls and production traceability to the exact released revision.
8. **Warehouse & inventory:** locations/bins, barcode workflows, put-away/picking, transfers, reservations, cycle counts, stock adjustments with approvals, lots where needed, ageing, replenishment and landed cost.
9. **Procurement & suppliers:** RFQ, quotation comparison, approval matrix, PO, dispatch notice, receipt, incoming QC, bill, three-way match, supplier 360, scorecards, price history, lead-time reliability and committed spend.
10. **Logistics & project business:** dispatch planning, transporter/route, shipment milestones, POD, exceptions/freight, e-way-bill integration, project milestones/budget/cost/procurement/inventory/profitability and progress billing.
11. **People operations:** leave, attendance, shifts, payroll controls, recruitment, onboarding/offboarding, employee documents, training, performance, expense/advance/travel claims and labour costing.
12. **AI general manager:** grounded Ask Maestro, scheduled brief, anomaly/risk detection, evidence links, forecast confidence/backtesting, answer feedback, AI usage/latency monitoring, task/action proposals, approval queue and audit trail.
13. **Platform governance:** company/department/role/record boundaries, workflow and approval engine, master-data quality, universal search, documents, notifications, integration/background-job monitoring, API/webhooks, audit viewer, backup/restore and disaster-recovery tests.

## Implementation sequence

### Wave 0 — Safety and architecture baseline
- Reconcile repository migrations, live-schema compatibility, company context, role permissions and server/database enforcement.
- Verify current company isolation, AI retrieval/tool permissions, integration secrets, exports/print, notifications, storage and realtime.
- Establish a deploy/recovery gate; no production schema mutation while the configured Supabase project identity and recoverable backup are uncertain.
- Produce a route-to-capability inventory and a test matrix by role, company and workflow state.

### Wave 1 — CEO cockpit and work orchestration
- Improve the existing dashboard (do not replace it) with the AI Business Brief and Ask Maestro as primary management entry points.
- Add actionable exception/approval inbox only from real source records; every item must link to its source and have a named owner/status.
- Add as-of/freshness and unavailable-data states; never display failed reads as zero.
- Define the shared workflow/action proposal contract and approval/audit requirements.

### Wave 2 — Complete manufacturing execution
- Establish versioned routing, work-centre capacity and operation-level production tracking.
- Complete quality/CAPA, maintenance and ECO governance UIs against existing guarded database contracts.
- Keep material availability unknown until dated stock, reservation, inbound-supply and consumption contracts are validated.

### Wave 3 — Warehouse and procure-to-pay
- Deliver warehouse locations/bin and scan workflows, counts, replenishment and traceability.
- Complete RFQ → comparison → approval → PO → receipt/QC → bill → payment with supplier performance and three-way match.
- Keep every stock/accounting effect on canonical atomic server/database posting paths.

### Wave 4 — Commercial, finance and projects
- Complete CRM, quote/order lifecycle, customer service, returns, logistics/POD and project-based contract costing.
- Complete cash-flow/budget/profitability/fixed-asset/close controls using reconciled accounting facts.
- Do not infer tax splits, source values or historical allocations that are absent.

### Wave 5 — People and AI General Manager
- Complete HR lifecycle/leave/expense/training and labour costing.
- Add proactive, evidence-linked management briefings and anomaly/forecast monitoring with confidence and data-freshness indicators.
- Allow AI to draft actions, not silently execute high-impact mutations. Require approvals, idempotency and audit evidence.

### Wave 6 — Reliability and launch gates
- Role/company adversarial tests, cross-module workflow tests, accessibility/mobile checks, integration retry/dead-letter handling, backup restore rehearsal, performance tests and operator runbooks.
- Verify GitHub → existing Lovable project synchronization and published app commit before claiming the user can see changes on the phone.
- Validate real operational use with representative test records and business-owner sign-off; keep Tally retirement gated on accountant-approved reconciliation.

## Non-negotiable acceptance criteria

- No guessed live-schema assumptions or unverified production migrations.
- All reads respect the caller's approved profile, roles, company and row-level policy; all writes use server/database authorization and canonical domain functions.
- Every consequential action is auditable and idempotent; posted accounting and stock history is corrected through reversal/compensation, not silent edits.
- AI output cites source records/time period and labels actual, calculated, forecast, interpretation, recommendation or insufficient data.
- Errors, missing permissions and incomplete datasets are visibly different from a true zero.
- Each delivered increment includes tests, lint/build/CI evidence and a safe rollback/recovery story.
- A module is not marked complete because a route or mock screen exists. It is complete only when schema, authorization, workflow, audit, tests and end-to-end behavior agree.

## Current baseline

The repository already has sales, purchasing, inventory, production, accounting, HR, Tally integration, AI routes and several guarded enterprise foundations. The capability audit and production-readiness documents record substantial remaining gaps and live-activation gates. This plan coordinates those gaps into a single founder-led outcome; it does not override existing safety gates.
