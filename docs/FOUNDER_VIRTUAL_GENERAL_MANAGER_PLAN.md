# Mattress Maestro Business Management Environment — Product & Architecture Contract

**Status:** Target-state product definition and phased delivery contract. This document is not a claim that the target state has already been implemented.

## 1. The actual product goal

Evolve the existing Mattress Maestro ERP into a complete, AI-assisted Business Management Environment for the real operating model of:
- Abood Tradings / Zizz Mattress: mattress manufacturing, distribution, wholesale, retail and project/business sales.
- Abraz Sleeping Solutions: related commercial/assembly operations as configured in the business structure.
- Zizz Smart Sleep Technologies LLP (Smart SleepTec): engineering, designing, assembling into kits, testing and supplying smart-mattress systems—controller hardware, sensors, connectivity, firmware, diagnostics, documented BOMs and versioned kits—to Abood Tradings, Abraz and potentially other mattress manufacturers. Abood Tradings retains the Zizz trademark; intercompany supply, IP licence and accounting must be explicit rather than assuming the LLP owns the brand.
- Online and offline channels, sales teams, factories, warehouses, distributors, dealers, retailers, service teams and future business entities.

The environment should act like a virtual general manager: a single place to operate the business, understand what is happening, spot what is going wrong, decide what to do, assign and track actions, and see whether the action worked. It must support operational work—not merely show dashboards.

## 2. Product principles

1. **One environment, connected domains:** reuse current modules and canonical business records; no replacement project and no disconnected duplicate data stores.
2. **Mobile/tablet-first foundation:** every important workflow must be responsive and touch-friendly, with readable tables, large touch targets, scan/camera-friendly interactions, adaptable navigation, installable PWA capability where appropriate, and usable loading/error/empty states.
3. **Future installable device/OS-like product:** keep domain logic separate from UI; define typed APIs/contracts; use a shared design system; make authentication, company context, permissions, sync, notifications, device capabilities and background work explicit services. Avoid hard-coding browser-only assumptions into business logic. Prepare for a later managed tablet/PC shell or native client without pretending a web application alone is an operating system. Evaluate offline-first workflows only where conflict resolution, local encryption, device enrolment, revocation and reliable sync can be designed and tested.
4. **Offline and low-connectivity readiness:** production, stocktaking, delivery/POD, vehicle inspections, field sales and smart-mattress production/testing may need controlled offline capture. Queue changes with stable IDs, timestamps, actor/device identity, idempotency and conflict rules; never silently overwrite accounting or inventory postings.
5. **Multi-company by design:** explicit company/legal entity, branch, warehouse, department, cost centre and channel context. Cross-company views require permission and must preserve intercompany transactions, tax, stock and reporting boundaries.
6. **AI is an assistant, not an unaccountable autopilot:** every insight identifies its source, period, freshness and whether it is an actual, calculated result, forecast or recommendation. AI can draft and queue actions; consequential actions require permissions, confirmation/approval, idempotency and audit.
7. **Real implementation only:** no module is complete because a screen or mock exists. A module needs real data contracts, server/database authorization, workflow state transitions, audit trail, error handling, tests and end-to-end verification.
8. **Protect the live business:** do not apply migrations, alter production accounting/inventory or change Tally cutover until the correct Supabase project/schema and recovery plan are verified.

## 3. Complete business capability map

### A. Founder / CEO / General Management
- Unified daily and weekly operating brief; goals/OKRs; KPI scorecards and company/branch/channel comparison.
- Sales, margin, cash, collections, payable commitments, inventory exposure, production plan vs actual, capacity, service level, marketing ROI, fleet cost, workforce and customer health.
- Alerts, risks, exceptions, overdue approvals, accountable owner, due date, escalation, decision log and follow-up tracking.
- Scenario planning, budgets, forecasts, what-if analysis, delegation, meeting/management review packs and board/investor-ready reporting.
- Evidence-linked AI chat and recommendations with drill-through to the underlying record and visible data freshness.

### B. Master data and platform foundation
- Companies/legal entities, branches, warehouses, stores, channels, departments, cost centres, users, roles, record-level and action-level permissions.
- Parties, customers, suppliers, dealers, distributors, retailers, employees, products, mattress specifications, variants, units, price lists, tax settings, territories and payment terms.
- Approval matrix, workflow builder, task/assignment service, audit log, document management, global search, notifications, calendar, import/export and configurable reports.
- Data quality, duplicate detection, controlled master changes, retention, backups, restore tests, API/webhooks, integration health and access reviews.

### C. Sales, CRM, distribution, wholesale and retail
- Lead capture, campaign attribution, pipeline, follow-ups, visits, calls, field-sales route plans, customer 360, dealer/distributor onboarding and territory management.
- Quotations and revisions, price/discount approval, customer-specific schemes, credit limits, sales orders, promised dates, allocation, backorders, partial fulfilment, invoices, collections and commissions.
- Wholesale rate contracts, dealer schemes, distributor secondary-sales capture, retailer/dealer targets, sell-in vs sell-through, channel stock and territory profitability.
- Retail POS, barcode scan, counter sales, receipts, returns/exchanges, warranty registration, customer consent, loyalty, coupons and store/shift reconciliation, subject to applicable tax and payment integrations.
- B2B/project sales, tenders, contracts, site deliveries, installation, milestone billing and project profitability.
- Customer service, complaint/SLA, returns/RMA, warranty, replacement, service tickets, feedback and retention.

### D. Marketing and growth workspace
- Campaign calendar and campaign records across website, ecommerce, social, search, email, WhatsApp/SMS and offline activity where integrations are configured.
- Audience/segment lists, consent and opt-out controls, templates, creative/assets, approval, schedule, spend and channel attribution.
- Lead source, UTM/campaign tracking, landing pages/forms, coupon/referral codes, abandoned cart where supported, campaign-to-order attribution, conversion funnel and ROI.
- Product launches, seasonal campaigns, local dealer/retailer promotions, mattress model content, smart-mattress education and dealer enablement materials.
- Marketing automation triggers, follow-up tasks and performance reporting. Do not claim an external channel is connected until credentials, webhooks, opt-out and delivery reporting are implemented and tested.

### E. Ecommerce and digital commerce
- Product catalogue and variants, inventory availability, price lists, promotions, cart/order sync, payment status, shipping, cancellation/return, refund workflow and reconciliation.
- Sync with Zizz Mattress website and future channels using idempotent connectors, webhooks, retry queues, error visibility and channel-specific stock/price rules.
- Marketplace/channel order import only for explicitly configured providers; no assumed integration.

### F. Mattress manufacturing and production
- Product configuration/specification, versioned BOMs and routings; mattress-specific operations such as foam cutting, spring manufacture, quilting, taping, assembly, packing and inspection.
- MPS/MRP, demand forecast, material requirements, supplier lead times, reservations, substitutes, work-centre capacity, finite/rough-cut scheduling, job cards and shift planning.
- Material issue/return, WIP, operation progress, output, scrap, rework, downtime, labour, consumables, standard vs actual cost, production yield and plan-vs-actual.
- Shop-floor tablet workflows, barcode/QR scan, operator login, machine/line status and controlled capture during network interruptions.
- Traceability from sales order and production batch through BOM revision, material lots where applicable, QC result, finished item and dispatch.

### G. Zizz Smart SleepTec product engineering and kit lifecycle
- Separate product line and company/legal entity context for the Smart SleepTec engineering and kit-supply model.
- Configurable smart-mattress kits, controller and PCB revisions, motor/sensor/connectivity/thermal components, firmware version, wiring harnesses, connectors, fasteners, protection parts, assembly instructions and test specifications.
- Engineering BOM, product lifecycle/revisions, engineering change order, approved vendor parts, firmware release, serial/lot traceability, supplier quality and product compliance documentation.
- Incoming inspection, kit assembly, programming, end-of-line testing, burn-in where specified, diagnostic logs, Bluetooth/Wi-Fi pairing checks, device identity, calibration and quality release.
- ERP linkage to the future Zizz Master Control engineering console/tablet: device provisioning, firmware inventory, test fixtures, serial numbers, test results, repair/RMA, warranty, field diagnostics and service history. Hardware control must use authenticated and versioned protocols; never expose privileged device controls through a general ERP role.
- Intercompany quotation, transfer/sale, invoice, inventory, cost, margin, IP licence and support obligations between Smart SleepTec and mattress-assembly companies, with accountant-approved accounting/tax treatment.
- Support eventual external OEM customers without leaking another customer’s product designs, firmware, BOMs or device data.

### H. Quality, compliance and product safety
- Incoming, in-process and final inspection plans; spec/version control; non-conformance; quarantine/release; defect codes; root cause; CAPA; supplier score and audit evidence.
- Smart-mattress electrical/thermal/mechanical testing, component traceability, firmware release records, safety test evidence and recall/field-action readiness.
- Document expiry, compliance calendar, statutory records, controlled access to customer/employee documents and configurable retention.

### I. Procurement, suppliers and payables
- Purchase requisition, RFQ, supplier quote comparison, negotiation history, approvals, purchase order, delivery promise, ASN, goods receipt, incoming QC, purchase bill, three-way match, debit/credit notes and payment proposal.
- Supplier 360, lead-time and quality scorecards, price history, MOQ, alternate sources, contract/expiry, committed spend and purchase-vs-plan.
- Link demand to sales orders, production MRP, maintenance spares, marketing, IT and fleet purchases. Prevent unauthorised purchasing and duplicate invoice/payment risks.

### J. Inventory, warehouses and fulfilment
- Multi-warehouse/store stock, bins/locations, receipts, put-away, picks, packing, transfers, reservations, cycle counts, stocktake, adjustment approvals and reconciliation.
- Raw material, WIP, finished mattresses, smart kits, components, spare parts, consignment and channel/dealer stock where supported.
- Barcode/QR workflows, batch/serial/lot tracking where needed, ageing, slow-moving/obsolete stock, safety stock, replenishment, landed cost, valuation and stock-at-risk.
- Allocation rules for wholesale, retail, ecommerce, production and intercompany demand; accurate availability must account for reservations and open supply.

### K. Finance, accounting, treasury and tax
- General ledger, chart of accounts, cost centres, journals, sales/purchase invoices, receipts/payments, bank/cash, reconciliation, credit/debit notes, bill-wise ageing, advances and intercompany accounts.
- Cash position, 13-week cash forecast, collection commitments, payable calendar, working capital, budgets vs actual, product/customer/channel/branch margins, contribution, break-even and scenario modelling.
- GST and statutory workflows subject to verified legal/accounting requirements; payroll accounting, fixed assets/depreciation, expense claims, period close, audit evidence and management accounts.
- Every posting must use canonical atomic server/database functions with permissions, idempotency, audit and reversal/compensation. AI never posts directly without authorised workflow approval.

### L. Fleet, vehicles, fuel and transport
- Fleet/vehicle register, registration/insurance/permit/fitness/PUC expiry, assigned driver, ownership/lease, vehicle documents and compliance reminders.
- Trip/route/dispatch planning, odometer readings, trip sheets, delivery route, customer/site stops, proof of delivery, failed delivery, returns and freight allocation.
- Fuel fill-ups: vehicle, driver, date/time, odometer, litres, price, total, fuel type, station, receipt, card/cash and approver.
- Mileage efficiency, km/litre, cost/km, expected-vs-actual fuel, duplicate/suspicious fill-ups, odometer anomalies and fuel spend by vehicle/route/customer.
- Maintenance schedules, tyres, repairs, breakdowns, spares, downtime, accident/incident records, driver expenses and total cost of ownership.
- Fleet dashboards and optional GPS/telematics integration only where a real provider and consent/security design are configured.

### M. Logistics, installation and after-sales
- Shipment consolidation, transporter/vendor, freight quotes, dispatch checklist, tracking number, e-way bill where applicable, delivery milestones, POD, damage/shortage, freight bill and delivery SLA.
- Mattress delivery/installation, project site, installer allocation, service completion, customer sign-off, reverse logistics and returns.
- Customer complaint, warranty, replacement, smart-mattress diagnostics, repair/service parts, RMA and feedback loop to quality/engineering.

### N. People, shifts and workplace
- Recruitment, onboarding/offboarding, employee files, roles, attendance, leave, shift/roster, payroll controls, overtime, incentives/commission, training, performance, expense/advance/travel claims and labour costing.
- Production skill matrix and machine authorisation; fleet driver authorisation; access revocation and device/account offboarding.
- Respect privacy and role separation for salary, medical, identity and sensitive personnel information.

### O. Maintenance, assets, projects and IT
- Machinery and asset register, PM calendars, work orders, breakdowns, spare parts, calibration, downtime, MTBF/MTTR and maintenance cost.
- Project/contract budgets, milestones, resource planning, procurement, inventory consumption, site expenses, billing and profitability.
- IT/device inventory, tablet enrolment, application/version inventory, incident tracking, access reviews and support requests.

### P. AI Virtual General Manager and business intelligence
- Evidence-grounded Ask Maestro across approved modules; daily/weekly brief; anomaly detection; demand and cash-flow forecasts; margin leakage; overdue collection; stockout/excess stock; production bottleneck; supplier/delivery risk; campaign ROI; fleet fuel anomalies and warranty patterns.
- Each insight must show data source, company, time period, freshness, confidence/limitations, owner and recommended next action.
- AI-generated drafts for quotations, RFQs, marketing copy, reports, follow-up messages, production plans and management summaries, subject to review and permissions.
- Approval queue, task assignment, due dates, outcome tracking, feedback, evaluation dataset and model/provider cost/latency/error monitoring.
- Strict tool permissions and retrieval filtering by company, department, role, customer/vendor boundaries and sensitive fields. No prompt may override authorization; every consequential tool call is validated server-side.

## 4. Future installable tablet/device platform

The current work should make the business environment portable to a later tablet/PC installable shell while preserving a single source of truth.

- **Now:** modular responsive web app/PWA where appropriate; shared design tokens and reusable touch-friendly components; domain services separated from route/UI components; typed API contracts; server-enforced authorization; observable sync/integration jobs; accessibility and device viewport tests.
- **Next:** device-aware capability layer for camera/barcode, file capture, printing, notifications, Bluetooth/Wi-Fi workflows only where platform support and security permit; managed device registration, revocation and version compatibility.
- **Offline-ready domain design:** distinguish draft/capture operations that can safely queue from financial, stock and permission changes requiring online validation or conflict resolution. Local storage for sensitive data must be encrypted, scoped, expirable and clearable on revocation; define idempotency keys and conflict handling before enabling offline writes.
- **Later installable shell:** evaluate PWA installation, a managed kiosk/tablet wrapper or native client based on actual hardware requirements. The shell is not the business logic or a replacement database; it calls versioned APIs and syncs under the same security policy. OS-level claims, remote management and background execution must be based on a separately validated implementation.
- **Smart SleepTec engineering console:** treat this as a specialised client using the same product/device identity, firmware release, test and service APIs, with local test capture and controlled sync—not as an unrestricted route inside the general ERP.

## 5. Delivery sequence and gates

### Phase 0 — Baseline, safety and architecture
- Inventory every existing route, capability, table/RPC/server function, role/company rule, integration, test and known gap.
- Reconcile migrations against the correct Supabase project and schema; verify company isolation, AI retrieval/tool execution, storage, realtime, exports, notifications, secrets/configuration and recovery.
- Confirm GitHub-to-existing-Lovable sync and published commit; do not claim a GitHub change is visible on mobile until verified.
- Define shared company/branch context, permission model, audit/event contracts, workflow/action model, typed APIs, sync strategy and tablet UX standards.

### Phase 1 — Operating foundation and CEO command centre
- Fix existing broken workflows and role dashboard data states first.
- Build cross-company/department scorecards from real reconciled records, exceptions, approvals, owner/due-date task management and evidence-linked AI brief.
- Implement global search, notifications, action inbox and workflow/audit foundations without duplicating existing domain records.

### Phase 2 — Complete core transactional workflows
- Verify and finish parties/CRM, quotes/orders, sales/invoicing/collections, purchasing/receipts/bills/payments, inventory/warehouse, production/job cards, accounting/banking and reporting.
- Add end-to-end tests that cover order-to-cash, procure-to-pay, plan-to-produce, inventory transfer/count, returns/warranty and intercompany supply.

### Phase 3 — Factory excellence and Smart SleepTec
- Complete mattress-specific MPS/MRP, routing/capacity, WIP, quality/CAPA, maintenance and ECO/BOM revision.
- Implement Smart SleepTec kit configuration, engineering BOM/firmware release, serialised test/traceability, intercompany sale/supply and future engineering-console integration.

### Phase 4 — Growth, channel and customer operations
- Add marketing calendar/campaigns/attribution, channel analytics, retail POS, wholesale/distributor/retailer management, ecommerce sync, customer service, returns, warranty and project business.
- Add real channel connectors only with explicit credentials, webhooks, opt-out and retry/reconciliation behavior.

### Phase 5 — Fleet, logistics and people
- Deliver vehicle/fuel/maintenance/driver workflows, dispatch/POD, route and freight costs, installation/service, and complete HR/shift/expense/labour-costing flows.

### Phase 6 — AI general manager
- Expand from existing Ask Maestro/brief routes to grounded cross-domain insight, forecasts, exception detection, proposed actions, approvals and outcome feedback.
- Validate every AI tool and retrieval path against company/role/record permissions and adversarial tests.

### Phase 7 — Tablet installability, offline and release readiness
- Touch-first mobile/tablet testing, PWA/installability where appropriate, barcode/camera/print flows, controlled offline capture, sync conflict tests, device revocation, performance and accessibility.
- Backup restore rehearsal, integration retry/dead-letter handling, penetration/authorization tests, representative data reconciliation, operator runbooks and business-owner sign-off.
- Keep Tally retirement gated on accountant-approved reconciliation. No production cutover based only on code-level tests.

## 6. Non-negotiable acceptance criteria

- No guessed schema, fake records, placeholder-success flows or unverified production migrations.
- Every read/write respects approved user, role, company, branch, department and record scope; server/database enforcement is authoritative.
- Every consequential action is auditable, permission-checked and idempotent; posted history is corrected through reversal/compensation, not silent edits.
- Actuals, calculations, forecasts and recommendations are labelled distinctly; missing/error/forbidden data never appears as a true zero.
- External integrations are labelled configured/unconfigured and monitored for failure, retries, duplication and reconciliation.
- Every delivered increment has tests, CI evidence, safe rollback/recovery, and explicit UI/API/database behavior.
- Tablet/offline capabilities are enabled only after security, sync and conflict rules are implemented and tested.
- A module is complete only when real workflows work end-to-end for the relevant roles and companies.

## 7. Current baseline and honesty rule

The existing repository already contains business modules including sales, purchasing, inventory, production, accounting, HR, AI, printing and Tally integration. The exact coverage, database compatibility, company isolation, live activation and end-to-end behavior still need systematic verification. This plan coordinates the target state; it does not imply that the listed capabilities already exist or are production-ready.
