# Label Printing module — integration assessment & migration plan

No code changes made. This is an inspection report plus a staged plan awaiting your approval.

## 1. Frontend framework & structure
- TanStack Start v1 (React 19, Vite 7, Tailwind v4 via `src/styles.css`), shadcn/ui + Radix, lucide icons, sonner toasts.
- File-based routing in `src/routes/`. Every internal screen is a flat dot-named child of the `_app` layout: `_app.<section>.<page>.tsx` (e.g. `_app.inventory.items.tsx` → `/inventory/items`).
- `src/routes/_app.tsx` is the shell: auth gate, sidebar, role-based "Access denied" screen.
- Shared page chrome: `PageHeader` / `PageBody` (`src/components/PageHeader.tsx`).
- Printing today is browser-print based: `src/components/print/PrintLayout.tsx` (A4, `classic|modern|minimal` variants, `@page` CSS) plus `_app.print.*` routes. `jspdf`, `jspdf-autotable`, `html2pdf.js` are already installed.

## 2. Backend / database
- Lovable Cloud (Supabase Postgres). No edge functions — server logic is `createServerFn` in `src/lib/*.functions.ts`, server-only helpers in `*.server.ts`, public HTTP endpoints under `src/routes/api/public/*`.
- Browser reads/writes go directly through the generated Supabase client (`sb` re-exported from `src/lib/accounting.ts`) with RLS enforcing access.
- ~50 tables already exist (accounting, inventory, GST, payroll, notifications).

## 3. Authentication
- Supabase auth wrapped by `src/hooks/useAuth.tsx`: session, `profiles` row (status pending/approved/rejected), `user_roles`, trusted devices, 2-minute inactivity timeout on untrusted devices.
- Authorisation is centralised in `src/lib/permissions.ts` (`ROUTE_ROLES` prefix → allowed roles). The same array drives both the route guard and the sidebar, so adding one entry wires up nav + access at once.
- Roles: admin, sales, production, hr, customer, employee, accountant, vendor. DB-side checks use `has_role()`.

## 4. Existing data models relevant to labels
- Product-ish records live in three places: `stock_items` (name, code, unit, HSN, GST rate, standard cost/price, batch tracking, reorder levels), `product_models` (finished-goods spec: size, thickness, cover fabric, foam density, warranty, default price, `extra_specs` jsonb), `raw_materials`.
- Inventory: `godowns`, `stock_batches` (batch no, mfg/expiry), `stock_movements`, `stock_journals`.
- Sales: `sales_orders` / `sales_order_items` (links to `product_models`), `invoices` / `invoice_items`, `parties`.
- Purchase: `purchase_bills` / `purchase_bill_items` (link to `raw_materials`), `suppliers`.
- Users: `profiles`, `user_roles`, `employees`.
- Note: `stock_items` has no barcode/EAN column today, and `stock_items ↔ product_models` mapping exists (`mapped_model_id`) but is optional.

## 5. Navigation
`ROUTE_ROLES` in `src/lib/permissions.ts` defines order and access; `AppSidebar.tsx` maps each prefix to a label + icon. Sub-pages appear as a section route (`_app.inventory.tsx`) rendering tabs + `<Outlet />`.

## 6. Where Label Printing belongs
Add a top-level section `/labels` (own sidebar entry, icon `QrCode`/`Tags`), sibling to Inventory, with sub-routes:
- `/labels` → templates gallery/designer
- `/labels/print` → pick items/batches/orders, quantity, preview sheet, print
- `/labels/history` → print jobs log with reprint
- `/labels/settings` → printer/page presets, barcode symbology, default template
Roles: `admin, production, sales, accountant` (warehouse users). Deep-link entry points from Inventory items, Stock batches, Purchase GRN and Sales/Dispatch screens ("Print labels" button).

## 7. Database tables needed
- `label_templates` — name, description, code, page/media size (mm), label size, rows/cols, gaps, orientation, dpi, `layout jsonb` (element list: text/barcode/qr/image/box with x,y,w,h,font,binding path), `barcode_symbology`, `is_default`, `is_active`, created_by, timestamps.
- `label_print_jobs` — template_id, source ("stock_item" | "batch" | "sales_order" | "purchase_bill" | "manual"), source_id, `items jsonb` (resolved label payloads), total_labels, copies, status (queued/rendered/printed/failed), printed_by, printed_at, error, timestamps.
- `label_print_job_items` (optional, if per-label audit/reprint of a single label is wanted) — job_id, stock_item_id, batch_id, barcode_value, quantity, sequence.
- `label_settings` — singleton-ish row: default template, default symbology, barcode value strategy (item code / GTIN / generated), prefix + running counter, include price/GST/MRP flags, printer/page defaults.
- `stock_items` additions: `barcode` (unique, nullable), optionally `mrp`, `label_template_id`.
Every table: GRANT to `authenticated`/`service_role`, RLS on, policies via `has_role()` (read for label roles, write for admin/production), `updated_at` trigger.

## 8. Product record as source of truth
- Labels never store product text; they store **bindings** (`{{item.name}}`, `{{item.code}}`, `{{batch.batch_number}}`, `{{item.hsn_code}}`, `{{model.size}}`, `{{item.standard_price}}`). A resolver server fn hydrates bindings from `stock_items` (+ `product_models` via `mapped_model_id`, `stock_batches`, `godowns`) at print time.
- Barcode value comes from `stock_items.barcode`; if empty, generated once from `label_settings` prefix+counter and written back to the item, so the ERP row remains authoritative.
- Print jobs snapshot the resolved payload for audit/reprint fidelity, but new prints always re-resolve from the ERP record.

## 9. Conflicts & risks when importing the other Lovable project
- **Different stack/structure**: if the other project is Vite+React Router, its `src/pages/`, `App.tsx`, `react-router-dom` links and `useEffect` fetching must be rewritten as `src/routes/_app.labels.*.tsx` with TanStack Router + Query. Do not copy its router/entry files.
- **Second Supabase project**: it has its own tables, RLS, and generated `client.ts`/`types.ts`. Never copy `src/integrations/supabase/*` — those are auto-generated here. Its schema must be re-created as new migrations in this database, with prefixed names (`label_*`) to avoid collisions (`templates`, `settings`, `print_jobs` are dangerously generic).
- **Auth model mismatch**: its pages likely assume open access or a simpler auth. All screens must be placed under `_app` and registered in `ROUTE_ROLES`.
- **Design system**: hardcoded colors (`bg-white`, hex) from the other app will break theming; must be converted to semantic tokens. Its shadcn components may be older versions — reuse ours, don't overwrite `src/components/ui/*`.
- **Dependencies**: barcode/QR libs (`jsbarcode`, `bwip-js`, `qrcode`, `react-barcode`, fabric/konva for the designer) must be Worker-safe if used server-side — prefer client-side rendering; anything native (node-canvas, sharp) will fail in the Cloudflare worker runtime.
- **Printing model**: browsers cannot enumerate printers; ZPL/label-printer output needs either raw-download of ZPL or a local bridge (like the existing `biometric-sync` helper). Decide early: HTML/CSS sheet printing vs ZPL.
- **Data ownership**: risk of the label app creating its own product table and drifting from ERP items — mitigated by section 8.
- **Regression risk**: touching `permissions.ts`, `AppSidebar.tsx`, `styles.css`, `stock_items` schema affects existing screens; these are the only shared files that should change, each with a minimal diff.

## 10. Step-by-step migration plan (existing ERP untouched)
1. **Discovery** — you share the other project's route list, schema, package.json and its barcode/designer libraries. Produce a mapping table (their page → our route, their table → our `label_*` table).
2. **Decide print target** — HTML sheet printing (A4/label sheets, works everywhere) vs ZPL/thermal (needs bridge). Can start with HTML and add ZPL export later.
3. **Migration 1 (schema only)** — create `label_templates`, `label_print_jobs`, `label_settings` (+ job items if needed), grants, RLS, triggers; add `barcode`/`mrp` to `stock_items` as nullable. Nothing existing altered.
4. **Seed templates** — insert 3–4 stock templates (product shelf label, batch/carton label, 65-up A4 sheet, thermal 50×25mm) via data insert.
5. **Domain layer** — `src/lib/labels.ts` (types, mm/px helpers, binding resolver) and `src/lib/labels.functions.ts` (resolve bindings, allocate barcode, create/list print jobs) — no changes to existing libs.
6. **Rendering core** — `src/components/labels/LabelCanvas.tsx` + `LabelSheet.tsx`, print CSS mirroring `PrintLayout` conventions; barcode rendering client-side only.
7. **Routes** — add `_app.labels.tsx` (tabs + Outlet), `.index`, `.print`, `.history`, `.settings`. Self-contained.
8. **Wire nav & access** — one line in `ROUTE_ROLES`, one icon + label in `AppSidebar`. Verify every existing role's sidebar is unchanged otherwise.
9. **Port the designer** — bring the other app's template editor UI across screen by screen, converting styling to tokens and state to TanStack Query.
10. **ERP entry points** — "Print labels" actions on Inventory Items, Stock Batches, Purchase Bills (GRN), Dispatch — additive buttons only.
11. **Verification** — run existing tests, click through Dashboard/Invoices/Inventory/Accounting/Vendor portal per role, confirm no route or permission regressions, then print-preview each template.
12. **Optional follow-ups** — ZPL export, label reprint from history, batch-expiry labels, GS1 barcodes, per-customer private labelling.

## Open questions for you
- HTML sheet printing, thermal/ZPL, or both?
- Should labels bind to `stock_items`, `product_models`, or both?
- Do you want a full drag-and-drop template designer, or fixed templates with configurable fields?
