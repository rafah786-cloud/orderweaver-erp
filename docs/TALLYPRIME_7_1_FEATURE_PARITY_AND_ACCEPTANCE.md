# TallyPrime 7.1 Feature Parity Register — Mattress Maestro

**Register date:** 2026-10-24  
**Source baseline inspected:** `main` at `e04244f2a5a35d7cde88ca1183a29a053ae64cc3`  
**Purpose:** Trace documented TallyPrime features to an ERP capability, source evidence, the remaining gap, and objective release tests. This is an implementation register, not a claim of parity or production readiness.

## Current release and evidence rules

The current Tally Solutions download page observed for this audit lists TallyPrime Release 7.1. Tally's official Release 7.1 notes are the controlling source for release-specific additions. Tally's separate Developer Release 7.2 notes concern TDL developer tooling and do not, by themselves, establish a new TallyPrime business-product release.

Official entry points:
- [TallyPrime features and capabilities](https://help.tallysolutions.com/tallyprime-get-started/)
- [TallyPrime features by release](https://help.tallysolutions.com/tallyprime-features-release-wise/)
- [TallyPrime 7.1 release notes](https://help.tallysolutions.com/release-notes-tallyprime-7-1/)
- [TallyPrime accounting](https://help.tallysolutions.com/accounting-in-tally-prime/)
- [TallyPrime inventory](https://help.tallysolutions.com/inventory-tally/)
- [Banking utilities](https://help.tallysolutions.com/banking/)
- [Sales process](https://help.tallysolutions.com/sales-process-tally/)
- [Purchase process](https://help.tallysolutions.com/purchase-process-in-tallyprime/)
- [India compliance and taxation](https://help.tallysolutions.com/india-compliance-taxation/)
- [Payroll](https://help.tallysolutions.com/payroll-features-of-tally-erp-tally/)
- [Analysis and verification](https://help.tallysolutions.com/data-analysis-tally/)
- [Security and user management](https://help.tallysolutions.com/security-user-management-in-talllyprime/)
- [Data management, import/export, backup and restore](https://help.tallysolutions.com/manage-your-company-data-tally/)
- [XML integration](https://help.tallysolutions.com/xml-integration/)
- [JSON integration](https://help.tallysolutions.com/tally-prime-integration-using-json-1/)
- [Import data from JSON or XML](https://help.tallysolutions.com/import-data-from-xml-or-json/)
- [TallyPrime Cloud Access](https://help.tallysolutions.com/tallyprime-with-cloud-access/)

### Evidence status is deliberately strict

- **Source present — verify E2E:** related screen/domain/code exists, but the complete workflow and its data effects have not been proven.
- **Partial / control gap:** implementation exists, but documented feature breadth or financial/inventory integrity controls are incomplete.
- **Not evidenced:** a matching production-quality capability was not established from the inspected repository evidence. Do not infer it from a menu or roadmap.
- **External / licensed / jurisdiction-specific:** depends on licensed Tally services, provider access, local law, or an explicitly required jurisdiction. Do not build a fake success path.
- **Verified E2E:** reserve this label for a named automated or witnessed test with a retained result for the exact reviewed commit and test environment. No feature is promoted to this status by this register alone.

The current repository includes a broader [global ERP capability-gap audit](GLOBAL_ERP_CAPABILITY_GAP_AUDIT_2026-10-08.md), the [Tally retirement/remediation plan](../.lovable/plan/tallyprime-retirement-remediation-plan-2026-09-15.md), the [app surface audit](APP_SURFACE_AUDIT_2026-10-16.md), and the [production-readiness contract](ERP_PRODUCTION_READINESS.md). This register connects official vendor scope to those existing workstreams; it does not replace them.

## Feature-to-ERP register

The status below is a repository-level assessment. "Present" means source surfaces exist, not that a real production workflow has passed.

| ID | Tally capability / option | ERP evidence or destination | Current evidence status | Required end-to-end acceptance |
|---|---|---|---|---|
| C01 | Multiple companies / books and company selection | Company context, company switcher, scoped masters and transactions | Source present — verify E2E | Two companies with overlapping names/IDs; switching cannot leak data or change another company's books |
| C02 | Company configuration, base currency, financial year and feature settings | Company/settings and fiscal-year foundations | Partial / control gap | Company-specific configuration persists; overlapping/invalid years and unsupported currencies fail closed |
| C03 | Chart of Accounts, groups and ledgers | Accounting, groups/ledgers and Tally master parser | Partial / control gap | Import group hierarchy; preserve parent/nature; ledger balances reconcile to control totals |
| C04 | On-the-fly master creation during transactions | Master/domain forms | Source present — verify E2E | Create a linked master only with appropriate permission; reject duplicates and invalid references |
| C05 | Voucher types and configurable numbering | Voucher engine and numbering foundations | Partial / control gap | Series are atomic under concurrent requests; no duplicate numbers; gaps/cancellations/reversals remain auditable |
| C06 | Payment, receipt, contra and journal vouchers | Accounting voucher workflows | Partial / control gap | Correct debit/credit legs, period controls, immutable posted rows, reversal and replay tests |
| C07 | Sales, purchase, debit-note, credit-note and other voucher workflows | Sales/purchase/finance routes | Partial / control gap | Full lifecycle and ledger impact match approved Tally fixtures by date and voucher type |
| C08 | Day Book, ledger drill-down and voucher traceability | Accounting reports and source IDs | Source present — verify E2E | Every report row drills to its voucher/line; period filters and totals tie back to posted books |
| C09 | Single-entry / double-entry transaction entry | Voucher entry screens | Source present — verify E2E | Equivalent entries result in the same balanced posted accounting outcome |
| C10 | Bill-wise receivables/payables, new reference, against reference, advance and on-account | Tally bills and allocations staging; billwise accounting track | Partial / critical gap | Opening bills, partial/multiple settlements, advances, credit notes, write-offs and ageing match Tally |
| C11 | Outstanding reminders and bill ageing | Receivables/payables reporting and notifications | Partial / verify delivery | Aging as-of date is derived from posted bills and allocations; reminder audience/content is authorized |
| C12 | Interest calculation on outstanding dues | Not established as complete | Not evidenced | Approved rate/method/period/rounding fixtures; no unapproved posted interest; reproducible report and voucher links |
| C13 | Cost centres, categories, hierarchy and cost allocation | Cost-centre master and Tally parser | Partial / control gap | Multiple allocations per voucher line sum exactly to parent amount; reports reconcile by period |
| C14 | Budgets and budget-versus-actual analysis | Roadmap/analytics foundations | Partial / not verified | Versioned budgets, dimensions, period, variance calculations and permissions tested with seeded data |
| C15 | Scenarios / projections and cash-flow planning | AI/forecast and finance foundations | Partial / not verified | Forecast clearly separated from actuals; inputs/as-of time, formulas and uncertainty shown |
| C16 | Multiple currencies, exchange rates and revaluation | Currency/banking foundations | Partial / control gap | Rate source/date, realized/unrealized FX, rounding and period-end revaluation reconcile to test fixtures |
| S01 | Quotations, sales orders and order-based/direct sales cycles | Sales orders, quotations and invoices | Source present — verify E2E | Partial fulfilment, rejection, cancellation, revision, price/discount authorization and stock reservation tested |
| S02 | Sales invoices, tax invoices, bill of supply, delivery challan | Sales/invoice and print workflows | Partial / control gap | Document snapshot, tax calculation, numbering, print/export and accounting effects reconcile |
| S03 | Customer-specific prices, price levels and discounts | Sales/pricing foundations | Partial / verify rules | Effective date, discount percent/amount/both, permissions and price snapshot survive later master edits |
| S04 | Returns, credit/debit notes and cancellations | Sales/finance return paths | Partial / control gap | Return quantity/value/tax/stock/GL reverse exactly once; original links remain traceable |
| S05 | Sales register, customer ledger and receivable reports | Accounting/report routes | Source present — verify E2E | Filtered/dated totals reconcile with Day Book, GL and bill-wise reports |
| P01 | Purchase indent / order / receipt / bill lifecycle | Purchase orders, receipt, purchase bills | Source present — verify E2E | Full procure-to-pay, partial receipt, over-receipt, cancellation, inspection, bill and payment chain |
| P02 | Supplier ledgers, purchase returns, debit/credit notes | Vendors and purchase/finance routes | Partial / control gap | Supplier balances and notes reconcile; unauthorized users cannot change bank or payment data |
| P03 | Purchase order status, pending orders, receipts against order | Procurement workflows | Source present — verify E2E | No duplicate receipt; quantities cannot exceed policy limits without authorized exception |
| P04 | Mapping templates and import exception handling | Tally import/staging UI | Partial | Invalid/missing masters are quarantined with actionable row-level errors; retry is idempotent |
| I01 | Stock groups, categories, items and units of measure | Inventory masters and Tally parsers | Source present — verify E2E | Unit conversions are exact under defined precision; duplicate/master identity and parent-child scope tested |
| I02 | Godowns / locations and stock-by-location reports | Godown master and movements | Partial / control gap | Every movement has valid source/destination; paired transfer is atomic and nets to zero |
| I03 | Batch-wise stock, manufacturing/expiry dates | Parser/model coverage partial | Partial / control gap | Batch opening, consumption, transfer and dispatch reconcile by batch/godown with invalid combinations denied |
| I04 | Actual quantity vs billed quantity | Tally import models include both values | Partial / verify import | Fixtures preserve both separately; invoice, dispatch and e-invoice logic never silently equate them |
| I05 | Stock journal, physical stock and adjustments | Inventory journal/movement foundations | Partial / control gap | Count differences require approval/reason; stock is changed only through canonical movement posting |
| I06 | Reorder status / minimum stock / replenishment | Reorder and MRP surfaces | Partial / control gap | Net availability includes reservations and dated inbound supply without double counting |
| I07 | Inventory ageing, movement, fast/slow moving, godown summaries | Report surfaces partially present | Source present — verify E2E | Report figures reproduce from movement ledger for arbitrary period and location |
| I08 | Stock valuation, tracking item cost, landed costs | Inventory valuation foundation | Partial / critical gap | Dated receipt/issue, returns, transfer, production, cost layers and COGS match approved Tally fixtures |
| I09 | BOM, manufacturing, scrap/by-products and job work | BOM/production/BOQ foundations | Partial / critical gap | Versioned BOM, actual consumption, yield, scrap, WIP and finished-goods valuation reconcile |
| I10 | Consignment, third-party stock, subcontracting and job costing | Partial operational domains and job-work source gaps | Partial / not verified | Sent/received quantities and ownership reconcile; job cost/revenue/remaining material traceable |
| B01 | Bank ledgers, imported statements and bank reconciliation | Banking/reconciliation modules; isolated RPC test | Partial / verify live provider | Import bank statement, match/reject/split, duplicate detection and GL effects tested against synthetic statement |
| B02 | Potential matches, smart reconciliation and bill-wise matching | Bank reconciliation foundations | Partial / not verified | Match suggestions are explainable; no transaction auto-posts solely from fuzzy matching |
| B03 | Cheque management, cheque printing, payment advice | UI/domain surfaces | Source present — verify E2E | Real printer/PDF output, numbering, reprint, void and recipient scoping verified |
| B04 | Connected banking, online supplier payments, payment limits/status | Provider-dependent; real bank credentials not verified | External / not verified | Sandbox contract, amount/daily limits, maker-checker, idempotency, status callbacks and reconciliation |
| B05 | Payment requests, UPI QR/payment links and payment reconciliation | Payment foundation partially present | Partial / external | Signed callbacks, idempotency, order/ledger mapping, refunds and unmatched receipts all tested before live use |
| T01 | GST registration, tax configurations, HSN/SAC and GSTIN validation | GST/HSN/e-invoice routes and schema foundations | Partial / provider not verified | Intra/inter-state, place of supply, registration, exemption, reverse charge and date-effective rates match fixtures |
| T02 | GST sales/purchase registers, GSTR-1 and GSTR-3B | GST reporting foundations | Partial / critical gap | Register-to-GL and return totals reconcile, including zero-value sections, notes and amendments |
| T03 | GSTR-2A/2B import, reconciliation and potential matches | GST reconciliation foundation | Partial / provider not verified | Duplicate/mismatch/only-in-books/only-on-portal states remain distinct with review trail |
| T04 | IMS download, accept/reject/pending actions, upload/reset and ITC reduction | Product feature; no complete ERP equivalence verified | Not evidenced / external | Versioned supplier source, action history, ITC treatment, reset/retry and portal reconciliation tests |
| T05 | e-Invoice IRN and signed QR; cancel/status/foreign party dispatch details | e-invoice log/foundation | Partial / credentials not verified | Provider contract tests, duplicate-safe generation, cancellation windows, failure recovery and stored responses |
| T06 | e-Way Bill, transport Part B, transporter, extension/cancel/status | e-way-bill foundation | Partial / credentials not verified | Eligibility and exemptions by jurisdiction; transport changes and retries preserve provider/source evidence |
| T07 | TDS/TCS, e-TDS/e-TCS forms and statutory reports | Payroll/tax foundations | Partial / critical rules verify | Dated rate/threshold scenarios, deductions, deposits, certificates/returns and period-specific form validation |
| T08 | MSME reporting, supplier ageing/form annexures, edit logs | Source/roadmap partial | Partial / verify | Supplier PAN/registration and payable state reconcile; historical changes remain auditable |
| T09 | PF, ESI, NPS, Professional Tax, income-tax calculations | Payroll statutory foundation | Partial / critical rules verify | Current jurisdiction/date-specific statutory fixtures, caps, rounding, employee transitions and filing totals |
| H01 | Employee master/groups/categories and employment details | HR employee domain | Source present — verify E2E | Effective-dated profile changes, self/HR/Admin authorization and sensitive-field redaction tested |
| H02 | Pay heads, salary structure, Basic/HRA/DA/overtime/reimbursements/deductions | Salary/payslip foundations | Partial / critical rules verify | Effective-dated compensation, arrears, retroactive change and payroll ledger posting tested |
| H03 | Attendance types/units, attendance vouchers, attendance sheet/register | Attendance and biometric CSV import | Source present — verify E2E | Duplicate import, corrections, overtime, absence and lock-period behavior tested |
| H04 | Salary accrual, salary payment, arrears and pay-head breakups | Payroll routes/reports | Partial / critical rules verify | Gross-to-net and employer liabilities reconcile; duplicate payroll run and payment replay denied |
| H05 | Headcount, employee/payslip/attendance reports, expiries and statutory details | HR/payroll reports | Partial / verify | Row-level self access versus HR/Admin plus export, print and company-switching tests |
| R01 | Balance Sheet, P&L, Trial Balance, cash/funds flow, ledger and Day Book | Accounting reports exist | Source present — critical reconciliation required | Date/financial-year/as-of semantics, opening/movement/closing totals match Tally exactly |
| R02 | Ratio, cost/profitability, item/customer/channel analysis | Reports/AI/analytics foundations | Partial / verify formulas | Documented formulas, dimensions and drill-down reconcile to base transactions |
| R03 | Filters, multi/advanced filters, period/company comparison and exception reports | Report/filter foundations | Source present — verify E2E | Filter composition, pagination and totals tested; company/role scopes apply before pagination/export |
| R04 | Save report view and dashboard tiles with per-role visibility | Dashboard foundations | Partial / not verified | Views persist safely; sensitive tiles cannot leak through API/export despite UI hiding |
| R05 | Drill-down, search, SmartFind, keyboard navigation and quick-create | Search/navigation exist in source; parity incomplete | Partial / not verified | Global search respects permissions/company scope; direct URL and keyboard paths tested |
| R06 | Print/email/WhatsApp, PDF/Excel/CSV/HTML/XML/JPEG/JSON exports | Print, mail, exports and Tally interchange surfaces | Partial / verify output | Totals, encoding, long text, digital signature, page breaks, redaction and recipient authorization tested |
| R07 | Invoice template gallery, logos, watermarks, fonts/colors, header/footer images, terms and default per voucher type | Print customization exists; full Release 7.1 template parity not proven | Partial / not verified | Template versioning, tenant access, print/PDF/export/share consistency and injection/file-upload safety |
| SEC01 | Users, roles/security levels and screen/report activity permissions | Auth, role policies, company scoping | Source present — live behavior unverified | Admin/Accountant/Sales/Production/HR/Employee/Customer/Vendor CRUD and direct API/RPC access matrix |
| SEC02 | Password policies, backdated voucher restrictions and period cutoff | Auth/financial period foundations | Partial / control gap | Role/date cutoff enforced in database for create/alter/view/print, with audited override |
| SEC03 | Rate locks / hide financial tiles / secure WhatsApp activities | Role policies and presentation controls | Partial / not verified | Hidden UI data remains unavailable via API/RPC/export; registered sender permissions enforced |
| SEC04 | Edit Log and audit trail for create/alter/cancel/delete; before/after comparisons | Audit tables/logging foundations | Partial / coverage incomplete | Every sensitive mutation records actor, company, time, action, source, safe before/after and correlation ID |
| SEC05 | TallyVault-like data-at-rest protection and access revocation | Platform security foundations | Partial / verify deployment | Secret/backup encryption, least privilege, access revocation and recovery evidence verified separately |
| D01 | Backup, scheduled/connected backup, backup log, restore and version selection | ERP backup/restore not established E2E | Not evidenced / release blocker | Encrypted backup, isolated restore drill, row/control-total checks, recovery time and access test |
| D02 | Data migration between Tally versions and data repair/correction | Migration staging and repair tools | Partial / control gap | Isolated compatible-version restore; no repair on live company; before/after validation retained |
| D03 | Split data / move financial year / opening-balance continuation | Fiscal year foundations; split-equivalent not verified | Partial / not evidenced | FY close/opening balances and retained earnings transfer exactly; no duplicate openings |
| D04 | Import masters and transactions; duplicate behavior: combine opening, ignore duplicates, modify existing | XML Tally import/staging; mapping and reconciliation | Partial / critical gap | Identity-based mapping (not names alone); preview impact, explicit strategy, dry-run, idempotency and rollback |
| D05 | XML import/export and online HTTP integration | XML parser, read-only HTTP bridge, bundle staging | Source present — staging only / verify E2E | Tally's actual company identity, date range, complete collections, encoding, pagination and response errors validated |
| D06 | TallyPrime 7.0+ native JSON / JSONEx masters, vouchers and reports | PR #131 adds read-only JSONEx snapshot export from the local bridge; raw snapshots remain separate and are rejected by XML-only ERP staging | Partial / staging mapper absent | Official JSONEx fixtures for every supported collection/report, arrays and field-shape preservation, explicit company, response errors, native JSON-to-staging mapping, identity/lifecycle preservation and exact reconciliation |
| D07 | Excel/CSV mapping, error and exception reports | XLSX package and import/staging surfaces | Partial / not verified | Preview/field mapping, formula-injection protection, malformed rows, duplicate strategy and exact row accounting |
| D08 | Scheduled/real-time multi-location synchronization | Local read-only bridge and full snapshot staging; durable delta sync not proven | Partial / critical gap | AlterID/company watermarks, ordering, outbox, retries, dead-letter, pause/resume and idempotency tested under outage/replay |
| D09 | Extract/share data via ODBC, FTP, pivot tables | Report/export foundations; external data publishing not verified | Not evidenced / integration/security review | Read-only/minimum-scope access, explicit allowlist, rate limits, audit and no public database ports |
| X01 | TDL / plug-in customization and customer-specific extensions | Existing ERP uses React/TanStack/Supabase; not the TDL runtime | External equivalent required | Implement governed extension hooks only where needed; do not attempt to execute arbitrary TDL in the ERP |
| X02 | TallyPrime Server multi-user concurrency and central control | Database-backed concurrency; complete workload proof absent | Partial / not verified | Concurrent posting/import/load tests, lock contention, deterministic sequence, recovery and audit |
| X03 | Tally.NET connected services, remote access and Cloud Access | ERP web app / PWA foundation | Different architecture / partial | Secure session lifecycle, approved company scope, no private offline cache, device revocation and restore |
| X04 | E-mail, WhatsApp invoice/report delivery and OAuth mail | Communications/WhatsApp/email foundations | Partial / provider not verified | OAuth secret rotation, delivery status/retry, suppression/opt-out, attachment policy and no recipient leakage |
| X05 | Subscription/licence/TSS/renewal and product update notifications | No Tally licensing equivalent required for ERP business function | Out of scope unless separately specified | Keep vendor licensing controls separate; never fabricate Tally subscription status |
| X06 | Multi-language display and invoice export, including Arabic/bilingual documents | i18n and print surfaces partially present | Partial / verify fonts/formatting | Indian locale first; language/RTL tests only for explicitly enabled business jurisdictions |
| X07 | Other-country VAT/e-invoice packages (GCC, Kenya, Nepal) | No requirement/config verified for those regimes | External / jurisdiction-specific | Do not enable tax workflows absent legal/jurisdiction decision and country-specific provider tests |
| N71 | Release 7.1 personalised invoice templates and per-voucher-type default | Printing/template domain | Partial / verify | Template defaults are per company/type and persist under role controls |
| N71 | Auto-wrap text in masters, transactions, reports and printouts | Responsive tables/forms and print | Partial / verify | Long names/narrations fit, export consistently and remain keyboard/screen-reader usable |
| N71 | IMS Books View and party details fetched by GSTIN/UIN | GST reconciliation/supplier master | Not evidenced / external | Authenticated portal fixture, mismatched/unknown supplier handling and human review |
| N71 | Connected Banking ICICI online payments / potential-match summary | Banking provider layer | External / not verified | Sandbox-only contract tests; no live money movement during feature development |
| N71 | OAuth-authenticated email | Email queue/integration foundations | Partial / provider not verified | OAuth scope, refresh, revoke, error redaction, queued duplicate prevention and delivery reconciliation |
| N71 | e-TDS/e-TCS form updates under Income Tax Act 2025 | Tax/payroll statutory engine | Not evidenced / critical regulatory dependency | Versioned official form fixtures and accountant-verified period rules before enabling filing/export |
| N71 | Line discounts as percentage, amount or both | Sales pricing | Partial / verify formula | Exact rounding, taxable basis and ledger/tax totals for every supported discount combination |
| N71 | Reuse deleted voucher numbers | Voucher numbering | Policy decision needed | Do not copy behavior blindly; preserve legal auditability and unique durable source IDs under ERP numbering rules |
| N71 | Schedule III Division I financial statements export | Financial reports | Not evidenced / jurisdiction/entity applicability | Accountant-approved mapping, complete note schedules, export reconciliation and eligibility checks |
| N70 | SmartFind, Connected Banking 2.0, JSON import/export, scheduled cloud backup, ITC reduction in IMS | Search, banking, integration and backup foundations | Partial / not verified | Separate E2E acceptance in corresponding rows above |
| N61 | IMS workflows, edit-log summary, MSME updates, e-invoicing and report filter enhancements | GST/audit/report domains | Partial / not verified | Versioned portal fixtures, actor-based edit history and exception triage tested |

## Source-to-code starting points

These are existing source surfaces to verify and extend; they are not a list of proven complete behaviors:
- Tally page: `src/routes/_app.tally-import.tsx`
- Bulk import parser/integrity: `src/lib/tally-bulk.ts`, `src/lib/tally-import.ts`, `src/lib/tally-integrity.ts`
- Bulk staging UI: `src/components/TallyBulkStaging.tsx`
- Company-scoped source staging: `src/lib/tally-source-staging.ts`, `src/lib/tally-source-staging.functions.ts`
- Local read-only bridge client: `tally-bridge/src/tally-client.ts`
- Local bridge service: `tally-bridge/src/serve.ts`
- Current bridge protocol notes: `tally-bridge/README.md`
- Accounting replacement requirements: `.lovable/plan/tallyprime-retirement-remediation-plan-2026-09-15.md`
- Cross-module gap audit: `docs/GLOBAL_ERP_CAPABILITY_GAP_AUDIT_2026-10-08.md`

## Required implementation sequence

### Gate 0 — baseline integrity (must precede feature parity)

1. Confirm the actual deployment project's Supabase reference and schema. The available connected project reference previously differed from `supabase/config.toml`; do not apply migrations to an unverified project.
2. Make the authoritative Supabase CLI migration chain replay from empty disposable Supabase/PostgreSQL. Fix migration-order and SQL syntax failures only with schema diffs, integrity tests and a reviewed rollback plan.
3. Establish golden Tally test fixtures for at least sales, purchase, receipt, payment, contra, journal, debit/credit note, stock journal, cancelled/optional/deleted voucher, bill-wise allocations, multi-godown/batch, tax, cost-centre and opening balances. Include anonymized fixtures from the user's actual export where possible; never generate fake historic facts.
4. Test duplicate re-import, changed ALTERID/GUID payload, interrupted chunk uploads, company mix-up, out-of-order replay, concurrent posting, and rollback in an isolated disposable environment.

### Gate 1 — source fidelity, import and reconciliation

1. Support documented XML and TallyPrime 7.0+ native JSON/JSONEx as separately validated source formats. Do not guess the JSON schema: use official sample payloads/export fixtures, preserve the original byte stream/hash, and quarantine unknown/malformed records.
2. Preserve COMPANY/GUID/REMOTEID/MASTERID/ALTERID, voucher lifecycle, all ledger entries, inventory entries, batch/godown allocations, bill allocations, cost centres, tax fields, narration and original source payload.
3. Stage masters before dependent transactions; make mapping/duplicate strategy explicit; use source identifiers, not names alone.
4. Reconcile record counts, debit/credit, Trial Balance, GL, Balance Sheet, P&L, bill-wise balances/ageing, tax returns and stock quantity/value by item/location/batch. Every difference must drill down to source GUID and ERP row.
5. Implement durable incremental synchronization only after full-snapshot acceptance: per-company high-water mark, alter-ID handling, idempotency, queued retry, dead-letter, checkpoint after durable acknowledgment, monitoring and replay tests. Do not treat a full snapshot as delta sync.

### Gate 2 — canonical accounting and inventory parity

- Atomic double-entry posting; server-side authorization; balanced non-zero lines; effective accounting periods; idempotency; voucher immutability; cancellation/reversal; concurrent sequence tests.
- Bill-wise opening/new/against-reference/on-account/advance/cleared allocations tied to the correct party and voucher line.
- Single stock source of truth, immutable movements, dated valuation layers, atomic transfers, physical-count approval, batch/godown traceability, negative-stock policy and GL/WIP/COGS integration.
- Versioned tax snapshots at line level, returns/notes, effective dates, and GST control accounts reconciled to source reports.
- No cutover or Tally retirement until a complete historical period and current period are reconciled and restoration is proven.

### Gate 3 — operational parity and connected services

Complete the sales-to-cash, procure-to-pay, inventory/manufacturing, bank reconciliation, payroll/statutory and reporting workflows as independent vertical slices. Each slice has to pass positive and negative role tests, company isolation, direct endpoint/RPC tests, concurrency/replay tests, browser mobile/accessibility checks and data/report reconciliation before it can be marked E2E verified.

Provider-bound features remain sandbox-only until credentials and official provider contracts can be tested. Live payments, GST filing, e-invoice/e-way-bill submission, shipment booking and payroll remittance must not be enabled by UI changes alone.

### Gate 4 — reporting, security and operations

- Provide equivalent filters, saved views, drill-down, exports and print outputs without leaking data through pagination, CSV/Excel/PDF, notifications or cached data.
- Add activity/edit history for sensitive masters and posted transactions with actor/company/time/action/source, safe before/after snapshots and correlation IDs.
- Test every role (Admin, Accountant, Sales, Production, HR, Employee, Customer, Vendor), approved/pending/rejected accounts, company switches, session refresh/logout, direct API/RPC and export/print routes.
- Demonstrate encrypted backups and a successful isolated restore with row counts, ledger totals and stock valuation checks; publish recovery time and residual gaps.
- Run performance/load and observability checks on representative anonymized volumes and retain exact commit + environment + test results.

## Definition of done for any row

A capability may be marked **Verified E2E** only when the repository or test evidence identifies all of:
1. Implementation files and enabled configuration/feature flags.
2. Database migration and effective grants/RLS/RPC authorization where relevant.
3. Golden Tally source fixture or documented official provider fixture.
4. Positive and negative automated tests, including role/company/session/forged-ID/replay cases where relevant.
5. Report/ledger/stock reconciliation results and expected rounding basis.
6. Exact CI run ID and commit SHA, plus isolated browser or physical-device evidence where UI/external services are involved.
7. Backup/rollback and deployment status.

## Non-negotiable safety rules

- Never mark a row complete from a menu, source code, unit test alone, or a successful generic build.
- No production data mutation, migration, accounting cutover, bank payment, statutory filing, payroll payout, live shipment or Tally retirement as part of feature development.
- Do not disable RLS or weaken role/company boundaries to make tests pass.
- Preserve Tally as the historical/source-of-truth system until an explicitly approved and reversible cutover satisfies the separate retirement plan.
- No invented product, price, tax, historic ledger, tax-rate, bank or provider data.
- Use official Tally documentation first and record the release/version used for each integration contract.
- Keep Lovable coding/build credits unused unless separately authorized.

## First execution queue

1. **P0 — migration chain repair + disposable clean replay** (currently a blocker in the existing retirement plan).
2. **P0 — golden fixtures and source-faithful staging tests** for the existing four-company XML pipeline, including management-book isolation.
3. **P0 — atomic accounting/bill-wise/inventory posting and exact reconciliation** before new online transaction features.
4. **P1 — map raw JSONEx snapshots into ERP staging** only after official Tally 7.0+ fixtures for each supported master and Day Book are checked into tests. PR #131 provides the read-only source acquisition step, not the mapper or canonical import.
5. **P1 — durable delta sync, checkpointed retries and integration health** after the accepted baseline migration.
6. **P1 — GST/IMS/e-invoice/e-way bill, banking/cheques, payroll statutory, and report/print parity** as separate sandbox-tested vertical slices.
