# Zizz public website controls audit — 18 October 2026

## Findings from code review

The homepage had multiple visible controls with no action or a generic homepage anchor: the sleep-finder CTA was a button without a handler; Visit/enquire, Buying guidance and Business enquiries were plain cards; the header wishlist pointed to a nonexistent fragment; the homepage search did not submit a search; and most footer links all targeted `#support`. The catalogue already had model pages, but product pages showed a disabled purchase button, there was no wishlist page, and the cart/checkout did not implement a live order flow.

## Changes in this branch

- Hero and navigation shop actions open `/shop`; homepage search submits `q` to the model catalogue.
- Home comfort categories and collection “Explore” actions open the catalogue instead of looping back to another homepage section.
- “Find my mattress” and “Start finding my mattress” open the working sleep-preference questionnaire.
- “Visit / enquire” opens `/contact`, with a Google Maps embed, map directions, name/phone/email/enquiry form, and actions to open a pre-filled email or WhatsApp message.
- “Business enquiries”, custom enquiries, warranty/service and order-tracking footer items are routed to the enquiry form with the matching enquiry type.
- Footer routes now differ by intent; they no longer all jump to the same help section.
- Header help, wishlist, cart, and mobile menu destinations have working routes. The wishlist persists in browser storage and can be removed from the saved list.
- Model detail and catalogue cards let customers add models to a persistent enquiry list; the list supports quantity changes, removal, clearing and a pre-filled multi-model quotation request. Model detail pages also support direct model enquiries and wishlist saves.
- The homepage enquiry-list badge reflects its current saved quantity instead of always showing `0`.

## Exact limits / launch gates

- The map address uses the business address already configured in `src/lib/print-config.ts` and a public Valluvambram business listing. The sources reviewed do **not** confirm that the ALFA Tower address is the production factory entrance. The page explicitly tells visitors to confirm factory access with customer care until the owner confirms the exact factory pin.
- The contact form now posts validated submissions to `/api/public/website-enquiry`, which writes a reference-numbered record to the new company-scoped `website_enquiries` inbox and dispatches in-app notifications to approved Admin/Sales users with access to Abood Tradings. The new migration `supabase/migrations/20261018140000_zizz_website_enquiries.sql` must be applied before this endpoint can accept production submissions.
- Direct email and WhatsApp actions are retained as a fallback for `customercare@aboodtradings.in` and the publicly listed WhatsApp number +91 92880 22477. The visitor must confirm/send through their app. The production `email:stub` provider is explicitly unconfigured, and no approved `website.enquiry.created` WhatsApp template is registered; automated outbound email/WhatsApp is therefore not claimed.
- The 23 mattress names in the repository are draft records only. Approved variants, size-specific prices, specifications, stock/lead times, real product images, tax behavior, delivery dimensions/rates, serviceability, payment onboarding, policy text, persistent orders, secure callbacks/webhooks, and fulfilment are still missing or unverified.
- For those reasons, checkout and paid ordering remain deliberately disabled. Enabling purchases without these details could accept incorrect prices or promise unavailable products. The new pages improve navigation, customer enquiries and model selection; they do not falsely claim that the live payment/order system is complete.
- This change makes no database, Supabase, inventory, accounting or ERP data changes. No Lovable credits were used.
- The repository CI and build must pass before merging. The live website must still be synced/published via the existing deployment workflow and clicked through on the actual domain; GitHub changes alone do not publish the site.
