# Mattress Maestro — Global ERP Capability Gap Audit
Date: 2026-10-08

## Audit scope

This audit compares the current Mattress Maestro source/database architecture against major ERP capability patterns from SAP S/4HANA, Microsoft Dynamics 365 Supply Chain Management, Oracle NetSuite, Odoo 19 and ERPNext.

The audit inspected:
- application navigation and role model
- current public database tables and functions
- manufacturing, inventory, procurement, sales, finance, HR, GST, banking, Tally and AI source areas
- production-readiness and Tally-retirement contracts
- current AI architecture
- cross-module gaps that cannot be detected by checking screens alone

## Current strengths

- Double-entry accounting and controlled voucher lifecycle.
- Canonical inventory movement/valuation foundation.
- Company-scoped data and restrictive company access.
- Tally migration staging, validation, reconciliation and incremental-sync control plane.
- GST, e-invoice/e-way-bill foundations.
- Sales orders, invoices, purchases, production orders, BOQ, inventory and banking.
- Attendance/payroll foundations.
- Vendor portal and communications/WhatsApp foundations.
- AI retrieval-first architecture with RLS-scoped deterministic ERP retrievers.
- Server-side security and fail-closed accounting/inventory controls.

## P0/P1 capability gaps

### 1. Manufacturing planning and execution — P0
Missing or insufficiently represented as first-class domains:
- Master Production Schedule (MPS)
- Material Requirements Planning (MRP)
- demand forecasting linked to supply planning
- multi-level BOM explosion
- lead times and planned-order dates
- material availability/netting
- planned purchase orders and planned production orders
- work centres/resources
- routing and operation dependencies
- finite/infinite capacity planning
- production scheduling and rescheduling
- WIP tracking by operation
- operation-level labour/machine time
- subcontracting/outsourced operations
- production variance and actual-vs-standard cost
- shop-floor execution
- operator/job-card workflow
- downtime/OEE
- split/merge/backorder/unbuild/rework flows
- by-products and scrap rules

Mattress-specific process model:
foam cutting -> spring production/assembly -> quilting -> taping -> assembly -> QC -> packing -> finished goods.

### 2. Quality Management — P0
Create a dedicated quality domain:
- inspection plans
- control plans
- incoming inspection
- in-process inspection
- final inspection
- inspection characteristics/specifications
- pass/fail/conditional results
- non-conformance records
- defect taxonomy
- quarantine/release/reject decisions
- quality alerts
- root-cause analysis
- corrective/preventive actions (CAPA)
- closure verification
- supplier quality
- production quality
- customer-return quality
- traceability to source material, production order and finished good

### 3. Maintenance and Asset Management — P0
Create:
- asset register
- asset category/location/custodian
- machine hierarchy
- preventive maintenance plans
- maintenance schedules
- breakdown tickets
- corrective maintenance work orders
- technician assignment
- spare-parts consumption
- maintenance cost
- downtime
- MTBF
- MTTR
- maintenance history
- calibration where applicable
- production/maintenance scheduling conflict detection
- OEE inputs and dashboards

### 4. Engineering / PLM / BOM governance — P0
Current BOQ is not equivalent to enterprise BOM/PLM.
Add:
- BOM revisions
- revision numbering
- effective-from/effective-to
- ECO/engineering change orders
- approval stages
- change reason
- impact analysis
- controlled release
- historical production traceability to BOM revision
- obsolete-component handling
- product/specification documents

### 5. Advanced inventory and warehouse — P0
Current stock ledger is strong, but warehouse execution is incomplete.
Add:
- warehouse zones/bins
- bin-level stock
- put-away rules
- picking strategies
- transfer workflows
- barcode/QR scanning
- mobile warehouse workflows
- cycle counts
- stock-count approval/reconciliation
- batch/lot tracking beyond the current partial foundation
- serial tracking where applicable
- expiry/shelf-life where applicable
- landed cost allocation
- inventory reservation/availability by date
- replenishment rules
- ABC/XYZ classification
- inventory ageing
- warehouse productivity KPIs

### 6. Procurement and supplier management — P0
Add the complete procure-to-pay sourcing chain:
RFQ -> supplier quotation -> quotation comparison -> approval -> PO -> ASN/dispatch -> receipt -> inspection -> bill -> payment.

Also:
- supplier qualification
- approved supplier list
- supplier 360
- supplier scorecards
- price history
- purchase price variance
- lead-time performance
- delivery reliability
- rejection/quality history
- supplier risk
- three-way matching
- approval thresholds
- committed vs actual procurement spend

### 7. Sales / CRM / order management — P1
Add:
- leads
- opportunities
- sales pipeline
- activities/follow-ups
- quotations
- quotation revisions
- quotation approval
- pricing rules
- customer-specific pricing
- discount/credit controls
- customer 360
- order promising/ATP
- delivery schedules
- partial delivery/backorders
- returns/RMA
- credit/debit notes
- customer service cases
- delivery/POD tracking

### 8. Logistics and fulfillment — P1
Add:
- dispatch planning
- shipment records
- transporter/carrier master
- vehicle/route information
- packing/handling units
- delivery milestones
- proof of delivery
- shipment exceptions
- freight cost
- customer delivery SLA
- integration with e-way bill and invoice workflow

### 9. Finance expansion — P0/P1
Add:
- fixed asset register
- capitalization
- depreciation
- asset disposal
- asset transfer
- budgets
- budget versions
- budget vs actual
- cash-flow forecasting
- working-capital forecast
- cost-centre profitability
- product/customer/channel profitability
- standard/actual costing
- variance accounting
- month-end close checklist
- close controls
- controlled reopen
- management reporting packs
- consolidation/elimination improvements
- multi-currency revaluation where required

### 10. HR expansion — P1
Current employee/attendance/payroll foundation should expand to:
- leave/holiday management
- leave approval
- recruitment
- onboarding/offboarding
- employee documents
- performance management
- training
- expense claims
- employee advances
- travel
- disciplinary records
- workforce planning
- labour costing linked to production

### 11. Projects / contract business — P1
Especially relevant to project mattress supply:
- project master
- milestones
- tasks
- project budgets
- project-specific procurement
- project-specific inventory
- project costing
- committed vs actual cost
- project profitability
- customer billing by milestone/progress
- project documents
- project delivery status

### 12. AI 2.0 — P0
Existing AI foundation should evolve to:
- ERP data freshness/as-of timestamp
- Tally sync freshness state
- source-level evidence
- evidence drill-down
- exact/calculated/forecast/interpretation/insufficient-data status
- formal costing basis
- forecast confidence intervals and backtesting
- seasonal forecasting when history supports it
- answer evaluation/feedback
- retrieval/model latency monitoring
- AI usage/cost monitoring
- document prompt-injection boundary
- proactive management briefing
- proactive anomaly/risk alerts
- contextual AI inside customer/supplier/product/order/invoice/purchase/production screens
- visual KPI/chart/ranking responses
- reusable management skills
- governed draft actions with explicit approval
- human-in-the-loop action audit

### 13. Platform / enterprise controls — P1
Add or strengthen:
- configurable workflow engine
- approval matrix by amount/risk/document type
- master-data governance
- duplicate detection
- data-quality rules
- universal search
- attachment/document management
- configurable notifications
- API/webhooks
- integration monitoring
- background-job monitoring
- error/dead-letter management
- audit-log viewer and export
- backup/restore verification
- disaster-recovery runbook and recovery testing
- performance monitoring
- archival/retention policies
- accessibility/mobile hardening

## Cross-module target architecture

Demand
-> Sales/CRM
-> MPS
-> MRP
-> Material Availability
-> Procurement / Planned Production
-> Capacity & Scheduling
-> Shop Floor
-> Quality
-> Finished Goods
-> Warehouse
-> Dispatch
-> Invoice
-> Receivable
-> Cash

In parallel:
Product/PLM -> BOM revisions -> Manufacturing
Asset/Maintenance -> Capacity availability -> Manufacturing
Supplier Quality -> Procurement -> Incoming QC
Costing -> Inventory + Production + Finance
AI -> all governed read models -> recommendations -> approval -> controlled action

## Priority implementation sequence

1. Manufacturing planning/MRP foundations.
2. Quality management.
3. Maintenance/assets.
4. BOM/PLM/ECO governance.
5. Advanced warehouse.
6. Procurement/supplier 360.
7. Finance expansion.
8. Sales/CRM/logistics/returns.
9. HR/projects.
10. AI 2.0.
11. Platform/observability/DR.

## Non-negotiable implementation rule

Do not replace the existing accounting, inventory, Tally or security foundations casually.

Every new module must:
- respect company isolation and RLS
- use server/database-controlled mutations
- preserve auditability
- integrate with canonical accounting/inventory effects
- support idempotency where a retry can occur
- avoid inventing historical/source data
- have automated tests
- have explicit workflow states
- be designed for future AI consumption

## Reference benchmark

The target is not feature-count parity with one vendor. Mattress Maestro should combine:
- SAP-style governed enterprise process control
- Dynamics-style connected planning, supply chain and AI agents
- NetSuite-style integrated finance/manufacturing/project/CRM breadth
- Odoo-style practical manufacturing/PLM/shop-floor workflows
- ERPNext-style accessible manufacturing and operational execution

The goal is a coherent mattress-manufacturing ERP rather than a collection of disconnected modules.
