# AI-Assisted Business Management Environment — Blueprint Source of Truth

> **Source report:** Original owner-supplied 69-page PDF; reference checksum recorded in `docs/AUDIT.md` (not stored in this repository).  
> **Authority:** `docs/blueprint-full.md` is authoritative for every implementation and audit task. Read the relevant sections directly before each task. This file is navigation only; do not use it as a substitute for the full text.  


## Part I — Vision and operating principles (Sections 1–10)

### 1. Executive summary
One business operating system for sales, credit, production, stores, purchasing, finance, HR, quality, logistics, marketing and service. AI must observe, recommend and execute bounded tasks under human control. Data and workflows come first; dashboards, prediction and autonomous agents follow. The system is auditable and multilingual (English, Malayalam, Hindi, Tamil), mobile/messaging-first.

### 2. AI architecture
Layers: PostgreSQL/Supabase data; integration connectors; event bus/outbox; company knowledge/RAG; specialist agents plus orchestrator; swappable model gateway; role-based web/mobile/WhatsApp/voice interfaces; governance. Agent autonomy levels are L0 Observe, L1 Suggest, L2 Draft, L3 Act within limits, L4 Act and report. Payments, price changes, hiring/firing and statutory filings require human approval (at least L2). Cross-cutting capabilities include ask-anything, document AI, multilingual voice/chat, computer vision, forecasting, anomaly detection, scenario simulation and source-record explainability.

### 3. Business modules and agents
- **Sales, dealers and CRM:** party/dealer masters, quotation/order/invoice workflow, price lists and discount controls, omnichannel order capture, credit-aware invoice blocking, leads/visits, field-sales app and dealer portal. Agents: Sales Copilot, Dealer Health/Churn, Next-Best-Offer, Lead Scoring/Follow-up, Quote Optimizer, Demand Forecast.
- **Credit and collections:** receivables ageing, promises/disputes, order/dispatch holds and collection assignments. Agents: Collections, Payment Prediction, Credit Limit Advisor, Bank Reconciliation.
- **Production/manufacturing:** versioned BOMs, production orders, QR job cards, routing/stages, WIP/capacity, wastage/yield, machine registry/downtime and unit costing. Agents: Production Planner, Bottleneck/Flow, BOM/Cost Guardian, Yield Optimizer, Predictive Maintenance, Shop-floor Voice.
- **Inventory/stores/procurement:** multi-godown batch/lot/bin inventory, reorder/safety stock, requisition→RFQ→PO→GRN→bill match, supplier ratings and price history, stock ageing/counts. Agents: Replenishment, Sourcing, Price Intelligence, Three-Way Match, Stock Audit, Supplier Risk.
- **Finance/accounting/costing:** Tally/native ledger integration, GST/TDS/e-invoice/e-way bill, AR/AP, payments, expenses, budgets/cost centres, profitability and 13-week cash flow. Agents: Bookkeeping, Cash-Flow Forecast, Margin Leak, Compliance, Fraud/Anomaly, Finance Q&A.
- **HR/workforce:** employee records, biometric attendance, shifts/overtime/leave, payroll/piece-rate, recruitment, training, safety, grievances and self-service. Agents: Attendance/Payroll, Workforce Planner, Recruitment (human decision required), Attrition/Engagement, HR Helpdesk.
- **Quality/warranty:** incoming/in-process/final inspection, non-conformance/CAPA, serial-to-material/machine/operator/dispatch traceability, warranty claims. Agents: Visual Inspection, Defect Pattern, Warranty/Complaint, Recall Simulator.
- **Logistics/delivery:** dispatch/load/route planning, vehicle/driver/transporter, e-way bill, proof of delivery, damage/returns and freight costs. Agents: Dispatch Optimizer, Delivery Promise, Freight Audit, Customer Notification.
- **Marketing/e-commerce/customer experience:** catalogue/content, marketplace and inventory sync, campaign ROI, loyalty/referrals/reviews, showroom/events. Agents: Content, Campaign Optimizer, Sleep Advisor, Review/Sentiment, Competitor Watch.
- **Product development/smart products:** product lifecycle, spec-to-cost simulation, smart device/BOM/firmware/warranty. Agents: R&D Copilot, Portfolio, Feedback-to-Feature.
- **Executive/strategy/governance:** owner cockpit, KPI/OKRs, board packs, risks/compliance, meetings/tasks/assets/insurance. Agents: Chief of Staff, Weekly Review, Scenario Planner, Task Follow-up, Strategy Analyst.

### 4. Agent orchestration
An orchestrator coordinates specialists for cross-functional requests, presents conflicts and trade-offs, and routes consequential decisions to an authorized human. Include scoped memory, registry, tool/limit/owner metadata, retries and per-agent kill switches.

### 5. Trust, safety and governance
Least privilege and role + agent tool permissions; approvals; tamper-evident audit trails; evaluation per agent and prompt/model change; source-record citations; no invented numeric facts; prompt-injection isolation for documents/messages; privacy and DPDP safeguards; tested backups/restores; offline/manual fallback; budgets/cost monitoring; named business owner for each agent.

### 6. Suggested technology stack
PostgreSQL/Supabase (Auth, RLS, Storage, Realtime, Edge Functions, pgvector); React/TypeScript PWA; queue/orchestration; swappable model gateway and safe MCP tools; WhatsApp Business API; Tally, biometric, bank, GST, courier and payment integrations. Keep integrations sandboxed until credentials and approval are supplied.

### 7. Dependency principle
Build the full system, with activation governed by dependencies and exit criteria—not calendar dates. Foundation/data discipline precedes control workflows, then intelligence and finally higher autonomy/differentiation. The definitive implementation dependency is Section 14.6 (WS0–WS8), transcribed below.

### 8–10. KPIs, risks, quick wins
Measure order-to-dispatch, on-time delivery, DSO/overdues, stock-outs/dead stock/turns, production yield/wastage/downtime, model margin after returns/freight, defect/warranty rates, forecast accuracy, staff adoption and agent acceptance/override/error/cost. Risks include dirty master data, resistance, over-automation, vendor/model lock-in, scope creep and security. Quick wins named by the report: owner briefing from Tally, invoice/challan Document AI, payment reminders with promise tracking, reorder alerts, QR job cards and ask-anything for sales/stock.

## Part II — Technical specification (Sections 11–14)

### 11. Database design
Follow the report's conventions: UUID primary keys; company and relevant branch scope; audit fields and soft-delete; INR money as numeric(14,2), quantities numeric(14,3); constrained statuses with status history; per-company/per-FY document number series; RLS for every table; JSONB custom fields on masters; files in private object storage with paths in database. Foundation includes companies, branches, profiles, roles/permissions, user-role mappings, audit log, event outbox, approval rules/requests, notifications, attachments, status history and number series.

The full data model spans master data; sales/CRM; credit/collections; production; inventory/procurement; finance/accounting; HR/payroll; quality/warranty; logistics; marketing/e-commerce; product development/smart products; executive/governance; and AI platform tables (agents, prompt versions, tools, triggers, runs, steps, actions, feedback, memory, knowledge, evaluations, gateway logs, budgets, conversations, forecasts and anomaly findings). The PDF's Section 11 is the detailed field-level authority and must be consulted before any schema task.

Core database functions/views/jobs in the PDF include permission/company helpers; credit checks; stock reservation; BOM explosion; the sole stock-ledger writer; receivables, stock, order, WIP, margin, dealer and machine-health views; scheduled materialized-view refresh; realtime on named operational tables; and separately secured storage buckets.

### 12. Screens and user experience
Shared shell: permission-filtered module navigation, phone bottom tabs, global command/microphone, context-aware AI panel, approval inbox, notification centre/task list, English/Malayalam/Hindi/Tamil, light/dark, offline/sync queue, reusable list/detail patterns with filters, saved views, export, AI summary, activity timeline and comments. The full PDF specifies Owner Cockpit, brief viewer, KPI/OKR scoreboard, scenario lab, profitability explorer, compliance calendar, meeting pack; detailed screens for every module; agent console/run viewer; and mobile/portal/display interfaces. Section 12 is the screen-by-screen authority.

### 13. AI agents
Use one governed agent runner—not independent ungoverned agents. Each agent has a named owner, first-version prompt stored in database, tool allow-list, autonomy level, budgets/limits, approval gates, run logs, action history/undo, evaluation cases and kill switch. The Section 13 prompt text and tool contracts in the PDF are authoritative. Agents never receive raw SQL; all numeric answers come from deterministic tools and cite source records. Untrusted source content is data, not instructions.

### 14. Supabase + React build specification
Use React/TypeScript, Vite, React Router, TanStack Query, Zustand, React Hook Form/Zod, Tailwind/shadcn, TanStack Table, charts/maps, i18next and PWA/offline support; Supabase/Postgres/Auth/Storage/Realtime/Edge Functions/pg_cron/pgvector; workers for Tally, biometric, heavy documents and forecasting/optimization; model gateway, agent runner/tool registry/RAG; development, staging with anonymized data, and production. Migrations are versioned and tests are mandatory.

#### 14.6 — Dependency workstreams (build all; no calendar ordering)
- **WS0 Platform foundation:** auth, roles/permissions, RLS patterns, audit/events, approvals, notifications, storage, number series, design system, app shell, i18n, offline framework, CI/CD/environments. Exit: role login and menu permissions work; approvals and audit work; RLS tests pass.
- **WS1 Master data and migration tools:** parties, items, models, BOMs, price lists, locations, employees; Tally/Excel import, duplicate detection and data-quality screens. Exit: real masters reconcile to Tally counts and data-quality score exists.
- **WS2 Transaction engines:** sales quote-to-invoice, stock ledger, procurement, production orders/job cards/QR, QC, dispatch, finance basics, HR attendance/payroll, complaints/warranty. Exit: order-to-cash and procure-to-pay end-to-end in staging with accounting reconciliation to Tally.
- **WS3 Integrations:** Tally, biometric, WhatsApp, GST/e-way bill, bank import, machine gateway. Exit: health monitoring, retry and reconciliation report per integration.
- **WS4 AI platform:** model gateway, tool registry, agent runner, memory, knowledge/RAG, approvals, run viewer, budgets, evaluation harness and prompt versioning. Exit: sample agent with approvals, undo, audit, budgets; failing evaluations block prompt changes.
- **WS5 Analytics and models:** views/materialized views, KPI engine, demand/cash/price/attendance forecasting, production/dispatch/cutting optimization, anomaly rules and simulation. Exit: historical forecast accuracy reported and optimizer validated by planners.
- **WS6 Agents:** order: platform agents (Orchestrator, Document AI, Assistant, Knowledge Librarian, Data Steward, AI Quality Auditor); reading analysts (Finance Q&A, Chief of Staff, Dealer Health, Margin, Demand, Payment Prediction); drafting agents (Bookkeeping, Replenishment, Sourcing, Quote, Planner, Complaint, Content); bounded acting agents (Collections, Customer Notifier, Three-Way Match, Bank Reconciliation, Shop-floor Voice, Attendance, Dispatch). Exit per agent: evaluation passed, owner/autonomy/limits set, clean run viewer.
- **WS7 Interfaces:** role dashboards, mobile/PWA apps for field sales/operator/store/driver/employee, dealer portal, customer advisor, large-screen boards, WhatsApp and voice flows. Exit: staff usability tests in their languages on real phones, including offline.
- **WS8 Governance and hardening:** security/penetration review, backup/restore drill, load/privacy (DPDP) review, approvals matrix, runbooks, incident process, training/SOP knowledge. Exit: owner signs off all items.

#### Other mandatory Section 14 rules
- Business rules for sensitive flows live in Postgres functions/constraints; clients and agents call RPCs rather than writing sensitive rows directly.
- Events use an outbox and retryable dispatcher.
- Environments are development/staging/production; no coding agent deploys production.
- Migration/cutover: export, clean/map, staging import and reconciliation, parallel run, module-by-module cutover only after explained/zero key-total differences; retain old records read-only.
- Testing: pgTAP RLS/functions/constraints; unit and contract tests; Playwright order-to-dispatch, GRN-to-payment and attendance-to-payroll; offline/low-network; agent evaluations and red-team prompt-injection/privilege/data-leak tests; department acceptance.
- Done means all tables with RLS/audit/tests; all screens role-appropriate and four-language; all agents with owner/prompt/tools/limits/evaluations/kill switch; monitored integrations; owner cockpit answers ten daily business questions; backup restore and approvals tested.
- Forecasts are probabilistic; OCR/vision need local corrections; data quality and human-approved decisions remain permanent responsibilities.

## Source fidelity notice
This index captures the structure, principal requirements and the exact WS0–WS8 dependency summary. It does not replace the detailed database field lists, screen specifications, tool schemas or complete agent prompts in `docs/blueprint-full.md`. No implementation may silently infer omitted specifications.
