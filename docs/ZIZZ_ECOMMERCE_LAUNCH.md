# Zizz Mattress e-commerce launch checklist

The storefront is part of the existing `rafah786-cloud/orderweaver-erp` application so it can be reviewed in the same Lovable-connected project and served under `www.zizzmattress.com`. Public shop routes are `/shop`, `/shop/:slug`, `/cart`, and `/checkout`. ERP routes and existing Supabase configuration are intentionally unchanged.

## Razorpay sandbox integration

- `POST /api/public/razorpay/create-order` creates a Razorpay **test-mode** order using a fixed server-side `RAZORPAY_TEST_AMOUNT_PAISE`; browser-supplied amounts are ignored.
- `POST /api/public/razorpay/verify-payment` checks the Standard Checkout HMAC-SHA256 signature with constant-time comparison.
- The UI handles checkout dismissal, payment failure, and signature-verification errors.
- Both endpoints reject live-mode credentials. Signature verification does not mark any ERP order as paid; no authoritative sales order is persisted by this sandbox flow.
- Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_TEST_AMOUNT_PAISE` only in the hosting platform's **server-side secrets/environment**. Never commit a real `.env` file. See `.env.example` for local variable names.
- The key secret previously pasted into a chat should be rotated before testing.

## Current implementation boundary

- All 23 supplied mattress model names are represented as draft catalogue entries in `src/lib/zizz-store-catalog.ts`.
- Draft pages deliberately do not display guessed prices, materials, comfort claims, warranty terms or reviews.
- The mattress illustration is generic and explicitly labelled illustrative; exact fabric patterns are not promised.
- The `/cart` route is a browser-persisted enquiry list: visitors can add model drafts, adjust quantities, remove items, and send a prepared multi-model quote request to customer care by email or WhatsApp. It does not create a sales order or collect payment.
- The sandbox payment path is only an integration test. **Live checkout remains disabled** until authoritative product variants/prices/tax, inventory, order persistence, fulfilment, webhooks and policies are verified.
- The catalogue currently uses local draft metadata. It is not yet connected to a production product, inventory, order, payment or shipping database.
- The website enquiry form has a server-side validation/storage path and a company-scoped ERP inbox. This intake route does not create sales orders or accept payment.

## Before accepting orders

1. Import and validate the owner-completed workbook (product master, size/price variants, layers, fabric options, product gallery/copy, and store settings).
2. Review each product's model code, name, construction layers, dimensions/thickness, firmness, tax-inclusive/exclusive price, stock/lead time, custom-size rules, and image alt text.
3. Confirm legal seller name/address, GST/tax treatment, support email/phone, delivery coverage and serviceability rules.
4. Finalize and publish privacy, terms, shipping/delivery, cancellation, returns/refunds, custom-size, and warranty policies.
5. Add server-side order/order-item snapshot storage, inventory reservation/validation, customer order access, admin fulfilment workflow and audit events before opening checkout.
6. Add a Razorpay webhook with raw-body HMAC validation, duplicate-event/idempotency protection, and authoritative payment-status reconciliation before fulfilment.
7. Configure shipping (Velocity Shipping credentials if used) and a truthful manual fallback. Enable COD only after explicit operational approval.
8. Test payment success, failure, cancellation, duplicate webhook, shipping failure, unavailable pincode, stale price, mobile checkout and customer/admin access with sandbox credentials.
9. Verify the live domain's hosting and routing setup. Publishing a Lovable preview does not by itself change DNS or production deployment.

## Safety

Do not connect this storefront to a guessed or replacement Supabase project. Preserve the ERP's existing database and auth configuration. Never enable live checkout while any of the requirements above are missing.
