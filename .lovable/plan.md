# Vendor Portal & WhatsApp Notifications

## Goal
Mirror the customer experience for vendors: registered vendors log in to a portal, view/acknowledge purchase orders, download PO PDFs, view their ledger, and receive WhatsApp notifications when a PO is placed, modified, or cancelled. Customer-side WhatsApp triggers (orders, invoices, ledger updates) are wired up in the same pass since the Twilio plumbing is shared.

## 1. Schema changes (one migration)
- `suppliers`: add `user_id uuid` (links to `auth.users`), `owner_id uuid`, `contact_person`, `state_code`, `pin_code`, `whatsapp_number`, `whatsapp_opt_in bool default true`, `credit_limit`.
- `purchase_bills`: add `vendor_ack_status text default 'pending'` (`pending|accepted|rejected`), `vendor_ack_at timestamptz`, `vendor_ack_note text`, `expected_dispatch_date date`.
- New `notification_log` table: `id, channel('whatsapp'), recipient_phone, party_kind('customer'|'vendor'|'staff'), party_id, event_type, ref_table, ref_id, status, error, payload jsonb, sent_at`.
- Update RLS on `suppliers`, `purchase_bills`, `purchase_bill_items`, `supplier_ledger_entries` so a user with the `vendor` role sees only rows where `suppliers.user_id = auth.uid()`. Keep existing admin/production policies.
- New `vendor_invites` table for admin-issued invites (email, token hash, supplier_id, expires_at, accepted_at).

## 2. Vendor auth
- Admin "Invite vendor" action on the Suppliers/Vendors page → generates a one-time signup link (`/vendor-signup?token=…`).
- Signup page consumes the token via a server fn, creates the auth user, assigns `vendor` role, and sets `suppliers.user_id`.
- `vendor` role already exists in `app_role` enum from the earlier user-categories work; if not, add it in the same migration.

## 3. Vendor portal (under `_authenticated/vendor/…`)
- `vendor/index.tsx` — dashboard: open POs, outstanding balance.
- `vendor/purchase-orders.tsx` — list POs with status + acknowledge buttons.
- `vendor/purchase-orders.$id.tsx` — PO detail with line items, accept/reject + expected dispatch date, "Download PDF" button.
- `vendor/ledger.tsx` — supplier ledger with date range filter and CSV export.
- Sidebar entries shown only when role = `vendor`.

## 4. PDF generation
- Reuse existing PDF approach if present; otherwise client-side `jspdf` + `jspdf-autotable` for PO and ledger PDFs (kept in `src/lib/pdf/`).

## 5. WhatsApp via Twilio
- New server fn `sendWhatsAppMessage` in `src/lib/whatsapp.functions.ts` posting to the Twilio gateway (`POST /Messages.json`, `From=whatsapp:<sandbox>`, `To=whatsapp:<recipient>`).
- Reads `LOVABLE_API_KEY` + `TWILIO_API_KEY` from server env (Twilio connector). If `TWILIO_API_KEY` is missing the fn logs to `notification_log` with status `skipped` so the app keeps working until the connector is linked.
- Helper `notifyEvent({event, ref})` resolves recipient, formats message body from a template, calls the send fn, and writes to `notification_log`.
- Triggers (called from existing create/update server fns):
  - **Vendor**: `purchase_bill.created`, `purchase_bill.updated`, `purchase_bill.cancelled`.
  - **Customer**: `sales_order.created`, `production_order.ready`, `invoice.issued`, `invoice.paid`, `ledger.statement_ready`.
- Each template ≤ 1024 chars, plain text, includes doc number + amount + a deep link to the portal.

## 6. Settings UI
- Extend the existing WhatsApp settings page so admins can toggle vendor/customer notification categories on/off and preview templates. Per-recipient opt-in still respected via `whatsapp_opt_in`.
- Surface a "Twilio not connected" banner with a button that triggers the Twilio connector flow if `TWILIO_API_KEY` env var is absent.

## 7. Out of scope (ask before adding)
- Inbound WhatsApp webhooks / two-way chat.
- Bulk marketing sends.
- Per-user role-based PO approval workflow inside the vendor portal beyond accept/reject.

## Technical notes
- All Twilio calls go through `https://connector-gateway.lovable.dev/twilio/Messages.json` with `Authorization: Bearer ${LOVABLE_API_KEY}` and `X-Connection-Api-Key: ${TWILIO_API_KEY}`. Never call api.twilio.com directly.
- All sends happen inside `createServerFn` handlers — never from the browser.
- `notification_log` is admin-readable; vendors/customers see only their own rows via RLS.
- `vendor` portal routes live under `src/routes/_authenticated/vendor/` so the integration-managed auth gate covers them.
