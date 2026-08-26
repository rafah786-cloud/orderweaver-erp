# Integration Architecture: Label Printing + Tally Connect into the ERP

No code changes have been made. This is analysis and a phased plan only.

## 1. What this ERP is today

**Frontend**
- TanStack Start (React 19 + Vite 7), file-based routing in `src/routes`, generated `routeTree.gen.ts`.
- One authenticated shell: `src/routes/_app.tsx` (session gate + approval gate + role gate + sidebar). Every module route is `_app.<module>.<page>.tsx`.
- Navigation is data-driven: `src/lib/permissions.ts` → `ROUTE_ROLES` is the single source for both sidebar items and route guards; `AppSidebar.tsx` derives NAV from it via `ICONS`/`LABELS` maps. Adding a module = one entry in `ROUTE_ROLES` + icon/label + route files. No sidebar surgery needed.
- Module landing pages follow the tile-grid pattern (`_app.inventory.tsx`, `_app.communications.tsx`) with `PageHeader`/`PageBody`.
- Reusable: shadcn/ui set, `PrintLayout` / `PrintPreviewModal` / `print-tables` (already a printing abstraction with classic/modern/minimal variants), `PartyMessagesDialog`, format/currency helpers.

**Backend**
- Lovable Cloud (Postgres) with RLS everywhere; server logic via `createServerFn` in `*.functions.ts` + `*.server.ts` helpers; public HTTP endpoints under `src/routes/api/public/*` (already used for biometric punches and WhatsApp webhooks).
- Auth: Supabase auth + `profiles` (pending/approved/rejected) + `user_roles` with enum `app_role` (admin, sales, production, hr, customer, employee, accountant, vendor) and `has_role()` security-definer. This stays the one auth system.

**Schema already covering the shared domain**
- Products/masters: `product_models`, `raw_materials`, `stock_items` (unit, alt unit, conversion, HSN, GST rate, valuation, reorder, standard cost/price), `hsn_codes`.
- Inventory: `godowns`, `stock_batches` (batch no, mfg/expiry), `stock_movements`, `stock_journals(+entries)`, `stock_valuation_settings`.
- Sales: `sales_orders(+items)`, `invoices(+items)`, `production_orders`.
- Purchases: `purchase_bills(+items)`, `suppliers`, `supplier_ledger_entries`.
- Parties: `parties` (+ `party_ledger_entries`), incl. `tally_name`, `customer_code`.
- Accounting: `ledger_groups`, `ledger_accounts`, `vouchers(+entries)`, `voucher_number_series`, `financial_years`, `cost_centers`, `currencies`, `bank_accounts`, `cheques`, `voucher_audit_log`.
- GST: `gst_returns`, `e_invoices`, `e_way_bills`, `gst_rate_changes`.
- Integration-ish: `notification_providers`, `notification_log`, `device_settings` (polled hardware device pattern — a useful precedent for printers), plus the existing Tally XML importer (`src/lib/tally-import.ts` / `.functions.ts` / `_app.tally-import.tsx`) which already parses groups, ledgers, godowns, cost centres, stock, bills.

**Gaps** (what genuinely must be new): barcode/SKU field on items, label templates, print jobs/history, printer config; Tally connection config, entity ID mapping, sync runs/queue/errors. Everything else already exists and must be reused, not duplicated.

## 2. Target module boundaries

Both new modules become **thin feature modules on top of ERP data**, never parallel masters.

```
src/routes/_app.labels.*        UI (print, templates, history, settings)
src/lib/labels/*.functions.ts   server fns (render, enqueue job, reprint)
src/lib/labels/*.server.ts      barcode/zpl/pdf generation helpers

src/routes/_app.tally.*         UI (dashboard, connection, sync, mappings, history, errors, settings)
src/lib/tally/*.functions.ts    server fns (connect test, import, export, retry)
src/routes/api/public/tally/*   endpoint for a local Tally bridge/agent to poll & push
```
Existing `/tally-import` becomes the "Import → XML upload" tab inside Tally Connect (route kept alive with a redirect so bookmarks don't break).

## 3. Label Printing module

Source of truth = ERP. New tables only for label-specific concerns:
- `barcodes` (or `stock_items.barcode` + `stock_batches.barcode`): EAN-13/Code128/QR value, symbology, unique per item/batch. ERP owns it.
- `label_templates`: name, size (w/h mm), DPI, orientation, engine (`html`|`zpl`), field layout JSON, default copies, active flag.
- `label_printers`: name, type (network/ZPL, browser/PDF, local agent), address/port or agent id, default template, is_active — modeled on `device_settings`.
- `label_print_jobs`: template_id, printer_id, requested_by, status (queued/printing/done/failed), copies, payload snapshot, error, timestamps.
- `label_print_job_items`: job_id, stock_item_id / batch_id / invoice_id, qty, resolved field values (name, SKU, barcode, MRP, batch, mfg, expiry, HSN, GST).

Behaviour: product selection reads `stock_items` + `stock_batches` (expiry/lot already there); MRP/price from `stock_items.standard_price` with a per-job override captured in the job snapshot; copies per line; reprint = clone an existing job (new job row, `reprinted_from` link) so history stays auditable. Scanning is a browser camera/keyboard-wedge input that resolves a barcode → stock item, reused by inventory screens later. Rendering reuses the existing `PrintLayout`/`PrintPreviewModal` pattern for the HTML/PDF engine; ZPL is a string template for label printers.

Printer reality check: the Worker runtime cannot talk to a LAN printer. Two supported paths — (a) browser print of a PDF/HTML sheet, (b) a small local agent that polls a queue, exactly like `biometric-sync/` already does for punch devices. That agent pattern should be reused rather than invented.

## 4. Tally Connect module

Tally has no cloud API: it exposes XML over HTTP on port 9000 on the LAN. So the architecture must be **bridge-based**, and whatever the existing Tally Connect app uses (local connector service, ODBC, XML HTTP) should be preserved as the transport. ERP side:
- `tally_connections`: name, company_name, GUID, host/port or agent id, api_key_hash, last_seen_at, status, is_active.
- `tally_sync_settings`: per-entity direction (import / export / both / off), conflict policy, batch size, auto-schedule.
- `tally_entity_map`: erp_table, erp_id, tally_guid, tally_master_id, alter_id, last_synced_at, checksum — the anti-duplication backbone (`parties.tally_name` / `suppliers.tally_name` seed it).
- `tally_sync_runs`: connection_id, direction, entity types, started/finished, counts (ok/skipped/failed), triggered_by.
- `tally_sync_records`: run_id, entity, erp_id, action, status, request/response payload, error, attempt count → drives Failed Records, Errors, and Retry (bounded exponential backoff, mirroring the WhatsApp retry logic already in place).
- Idempotency key per (connection, entity, erp_id, alter_id) — same pattern already used in `notification_log`.

Coverage maps 1:1 onto existing tables: groups→`ledger_groups`, ledgers→`ledger_accounts`, debtors/creditors→`parties`/`suppliers`, stock groups/items/units→`stock_items`, sales/purchase/receipt/payment/journal vouchers→`vouchers`+`voucher_entries`, GST→`hsn_codes`/invoice GST fields. Nothing new is created for these.

## 5. Data ownership

| Entity | Source of truth | Notes |
|---|---|---|
| Products / stock items, SKU, HSN, GST rate | ERP | Tally receives; labels read only |
| Barcode | ERP | new field/table, generated here |
| Stock quantity & valuation | ERP | `stock_movements` is authoritative; push summaries to Tally |
| Batches, MRP, expiry | ERP | labels read `stock_batches` |
| Customers / suppliers | ERP | Tally import may create, then ERP owns; matched via `tally_entity_map` |
| Prices | ERP | |
| Sales orders, invoices, purchases | ERP | exported to Tally as vouchers |
| Ledger groups & chart of accounts | Tally (initially) → ERP after cutover | one-time import, then ERP owns |
| Opening balances / historic vouchers | Tally | import once, never re-import |
| Accounting closing balances | ERP once vouchers are ERP-generated | avoid two-way voucher sync |
| Label templates, printers, print jobs | Label module | isolated, no ERP conflict |
| Users, roles, auth | ERP | sole identity provider |

Rule: exactly one writer per field. Tally sync is export-dominant after the initial import, with `tally_entity_map` preventing re-creation.

## 6. Permissions

Extend the existing model rather than a new system. Today access is role→route-prefix. Recommendation: add fine-grained `permissions` + `role_permissions` tables (roles still in `user_roles`), and keep `ROUTE_ROLES` for coarse routing. Proposed keys: `labels.view`, `labels.print`, `labels.templates.manage`, `labels.printers.manage`, `tally.view`, `tally.connect`, `tally.import`, `tally.export`, `tally.sync.run`, `tally.history.view`, `tally.retry`, `tally.settings.manage`. Default grants: admin all; production/sales get `labels.view` + `labels.print`; accountant gets the tally view/import/export/run/history set; nobody else. Enforced in RLS policies via `has_permission()` security-definer, not just in the UI.

## 7. Navigation

Keep the existing single-level `ROUTE_ROLES` sidebar; add two entries and give each a tile landing page like Inventory:

```
Dashboard · Parties · Sales Orders · Invoices · Purchases · Production · BOQ
Inventory · Accounting · Banking · GST
Label Printing → Print Labels | Templates | Printers | Print History
Tally Connect  → Dashboard | Connection | Import | Export/Sync | Mappings | Sync History | Errors | Settings
Employees · Attendance · Payslips · Communications · Vendor Portal · Approvals · Settings
```
Optional later refinement: group the sidebar into sections (Operations / Finance / Integrations / Admin) — a presentation-only change to `AppSidebar.tsx`.

## 8. Risks

- **Duplicate masters** — the other two apps have their own product/party tables; importing them wholesale would fork the master. Mitigation: import as *mappings*, not rows; match on code/HSN/name and require manual review of unmatched.
- **ID conflicts** — UUIDs won't collide, but the same real-world product existing twice will. Mitigation: dedupe pass with a review UI before any data move.
- **Duplicate users/auth** — the other apps have their own Supabase projects and user tables. Users must be re-invited into this ERP; do not copy `auth.users`. Expect password resets.
- **Two-way Tally sync** — the classic failure mode (double vouchers, drifting balances). Mitigation: one-directional per entity, `alter_id` tracking, idempotency keys, dry-run mode.
- **Period locks / financial years** — ERP has `is_period_locked`; imports into locked periods must be rejected, not silently skipped.
- **Voucher numbering** — ERP `voucher_number_series` vs Tally numbering can collide; decide one numbering authority per voucher type up front.
- **Printer/network** — Worker runtime has no LAN access, no `child_process`, no native rendering (no sharp/canvas). Barcode rendering must be pure-JS/SVG; LAN printing needs the local-agent pattern.
- **Label correctness** — wrong MRP/expiry on a physical label is a compliance issue. Snapshot every field into the job row and make reprints reuse the snapshot.
- **Secrets** — the other apps' API keys must be re-added as ERP secrets; the Tally agent needs its own hashed API key per connection (never a shared static token), same as `device_settings`.
- **RLS gaps** — every new table needs GRANTs + policies in the same migration, or the module silently 403s.
- **Data migration** — no destructive migration. Old apps stay read-only during cutover; ERP is populated additively and reconciled before the old apps are retired.

## 9. Phased plan

1. **Analysis** — export schemas + route lists of the Label Printing and Tally Connect apps; produce a field-level mapping sheet against the tables above; confirm the Tally transport actually used today.
2. **Data ownership** — ratify the table in §5; add `barcode`/SKU to `stock_items`; create the label and tally tables with GRANTs + RLS; no data moved yet.
3. **Auth & permissions** — add `permissions`/`role_permissions` + `has_permission()`; seed the keys in §6; wire route guards.
4. **Label Printing** — port templates/printers/generation into `src/lib/labels`, build the four screens on ERP product data, keep the old app running in parallel; validate against physical prints.
5. **Tally Connect** — fold the current XML importer in as the Import tab, add connection config + mapping + sync runs; run export in dry-run against a Tally test company before enabling writes.
6. **Navigation & UI** — add the two `ROUTE_ROLES` entries, tile landing pages, optional sidebar sectioning, redirect `/tally-import` → `/tally/import`.
7. **Testing** — unit tests for barcode/ZPL and Tally XML builders; end-to-end dry-run sync with reconciliation report (ERP totals vs Tally trial balance); label print QA on the real printer.
8. **Production migration** — freeze the old apps to read-only, run final mapping/import, reconcile balances and barcode coverage, switch users over with permissions granted.
9. **Decommission** — keep the old apps read-only for one full financial period as an archive, export their databases to cold storage, then unpublish. Never delete before reconciliation sign-off.

## Open questions before Phase 2

- Does the Tally Connect app use the local XML/HTTP port 9000 bridge, ODBC, or an agent service?
- Does the Label Printing app target ZPL/thermal printers, or browser/PDF sheets?
- Do those apps hold data that does not exist in this ERP and must be carried over?
