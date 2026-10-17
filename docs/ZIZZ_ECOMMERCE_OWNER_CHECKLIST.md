# Zizz Mattress e-commerce — owner-supplied launch inputs

Use this as the source-of-truth checklist for the first online-order launch. Keep secrets out of GitHub, chat messages, spreadsheets, screenshots, and browser-visible code.

## 1. Product master (required before selling)

Complete the editable product workbook with one row per model/variant:
- Approved public model name and SKU/model code.
- Available mattress sizes (length × width) and thickness for each size.
- Selling price per size/variant; clearly state whether each price includes GST.
- Construction layers in order, materials, foam density where applicable, spring/coir details, and any verified technical specification.
- Firmness/comfort level, intended use, accurate benefits and claims.
- Approved fabric/colour options currently available; who updates availability and how often.
- Manufacturing lead time, made-to-order vs ready stock, stock policy, and custom-size rules.
- Product images for each model/tier and any size-specific image. Images supplied as references do not authorize copying a competitor's copyrighted image.
- Warranty duration and coverage by product, care instructions, and any exclusions.

Do not enter approximate prices or inferred constructions. If a detail is unknown, mark it "TBC" and keep that product unpublished.

## 2. Seller identity and customer support

Supply the exact public-facing legal seller name, business address, customer-service phone and email, customer-service hours, GSTIN/tax registration details if applicable, and the entity that will issue invoices/credit notes. Confirm whether orders will be accepted only in India and which states/pincodes are in scope.

## 3. Delivery and fulfilment

Confirm whether Velocity Shipping will be the shipping provider for every order, and provide authorized access through the existing secure server-side configuration workflow (never put credentials in this file). Confirm pickup warehouse/address, pickup contact, package/outer dimensions and packed weight for each mattress size, dispatch SLA, delivery estimates by region, delivery/installation/old-mattress pickup services, remote-area exclusions, damage-in-transit procedure, and who handles shipment exceptions.

Mattress dimensions/weight must be measured or approved for the packed product, not guessed from the mattress dimensions.

## 4. Payments, COD and settlement

Choose the payment gateway and provide account onboarding/merchant approval through the provider's official secure process. Credentials and webhook secrets must be configured as server-only environment secrets, not committed to GitHub or sent in chat. Confirm allowed methods (UPI, cards, netbanking, wallets, COD), COD eligibility/limits, who bears payment fees, refund approver and expected refund SLA. Share only non-secret account status/merchant onboarding confirmation with the developer.

## 5. Customer-facing policies (approved wording)

Approve:
- Privacy policy and personal-data contact.
- Terms of sale and order acceptance/cancellation rules.
- Shipping/delivery and serviceability policy.
- Returns, exchanges and refund policy, including hygiene/custom-made mattress restrictions where lawful and applicable.
- Warranty and product-care policy.
- Custom-size order policy, cancellation limits, lead time and confirmation process.
- Tax invoice and grievance/contact process.

Obtain professional/legal review where needed; these policies affect consumer rights and should not be invented by the developer.

## 6. Commercial decisions

Confirm:
- Standard vs sale pricing, discount rules, coupon limits, start/end dates and whether offers stack.
- Free-shipping threshold or shipping charged separately.
- Whether custom-size mattresses can be ordered online at launch.
- Whether customer accounts are required or guest checkout is allowed.
- Whether the site should show live inventory or "made to order" lead times.
- Whether installation, old mattress pickup, pillows/protectors/accessories are part of launch scope.

## 7. Account access and production release

You must personally control and approve:
- Payment gateway onboarding and merchant KYC.
- Velocity Shipping account authorization and any production credentials.
- DNS/domain and hosting/production publish access, plus any production secret configuration requiring account-owner approval.
- Final legal-policy approval, product/pricing approval, and explicit go-live decision.

Never send passwords, API keys, OTPs, private keys, or webhook secrets in this checklist. Configure them through the provider dashboard or approved secret-management interface.

## 8. What the development team can build without waiting for the above

- Storefront layout, responsive product catalogue and model-detail pages.
- Product/variant data model and admin publishing workflow.
- Cart and server-side price recalculation.
- Checkout form and address validation.
- Order records and order-status lifecycle.
- Secure payment-gateway integration scaffolding and webhook verification once provider and secrets are configured.
- Velocity serviceability/rate/booking/tracking integration using existing project code, after reviewing it and verifying credentials and real package dimensions.
- Customer order history, admin fulfilment queue, emails/notifications, audit trail and failure/retry handling.
- Tests for stock/price changes, duplicate requests, failed/cancelled payments, duplicate webhooks, unavailable pincodes, failed booking and refunds.
- Accessibility, mobile layout, SEO, performance and release checklist.

## 9. Launch gates

No live order should be accepted until: at least one product has approved data and price; tax/invoice behavior is confirmed; shipping serviceability/rates and package data are tested; payment is tested in sandbox and then production; order persistence and duplicate prevention work; customer notifications work; refund/cancellation and privacy policies are published; monitoring and recovery procedures are tested; and the owner approves a live end-to-end test order.

This checklist does not authorize any change to the ERP's current Supabase project or production data. Storefront development must preserve the existing ERP and authentication setup.
