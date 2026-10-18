# Zizz Mattress e-commerce launch checklist

The storefront is part of the existing `rafah786-cloud/orderweaver-erp` application so it can be reviewed in the same Lovable-connected project and served under `www.zizzmattress.com`. Public shop routes are `/shop`, `/shop/:slug`, `/cart`, and `/checkout`. ERP routes and existing Supabase configuration are intentionally unchanged.

## Current implementation boundary

- All 23 supplied mattress model names are represented as draft catalogue entries in `src/lib/zizz-store-catalog.ts`.
- Draft pages deliberately do not display guessed prices, materials, comfort claims, warranty terms or reviews.
- The mattress illustration is generic and explicitly labelled illustrative; exact fabric patterns are not promised.
- The `/cart` route is a browser-persisted enquiry list: visitors can add model drafts, adjust quantities, remove items, and send a prepared multi-model quote request to customer care by email or WhatsApp. It does not create a sales order or collect payment.
- Checkout remains intentionally disabled until authoritative prices, tax treatment, fulfilment, payment and policy requirements are verified.
- The catalogue currently uses local draft metadata. It is not yet connected to a production product, inventory, order, payment or shipping database.

## Before accepting orders

1. Import and validate the owner-completed workbook (product master, size/price variants, layers, fabric options, product gallery/copy, and store settings).
2. Review each product's model code, name, construction layers, dimensions/thickness, firmness, tax-inclusive/exclusive price, stock/lead time, custom-size rules, and image alt text.
3. Generate or approve original product images per model and tier after the product tier and construction are known. Use a current fabric selector such as Light / Dark / Neutral / Current Fabric Selection, with an admin-maintained availability/review date. Explain that prints may vary with procurement.
4. Confirm legal seller name/address, GST/tax treatment, support email/phone, delivery coverage and serviceability rules.
5. Finalize and publish privacy, terms, shipping/delivery, cancellation, returns/refunds, custom-size, and warranty policies.
6. Configure a supported payment gateway with merchant credentials stored only in server-side secrets; validate signatures/webhooks and idempotency. Never store card data or accept client-submitted prices.
7. Configure shipping (Velocity Shipping credentials if used) and a truthful manual fallback. Enable COD only after explicit operational approval.
8. Add server-side order/order-item snapshot storage, inventory reservation/validation, customer order access, admin fulfilment workflow and audit events before opening checkout.
9. Test payment success, failure, cancellation, duplicate webhook, shipping failure, unavailable pincode, stale price, mobile checkout and customer/admin access with sandbox credentials.
10. Verify the live domain's hosting and routing setup. Publishing a Lovable preview does not by itself change DNS or production deployment.

## Safety

Do not connect this storefront to a guessed or replacement Supabase project. Preserve the ERP's existing database and auth configuration. Never enable checkout while any of the requirements above are missing.
