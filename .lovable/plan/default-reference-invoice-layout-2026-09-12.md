# Default Reference Invoice Layout

## What will change
- Replace the current default invoice print design with an A4 layout inspired by the supplied invoice: compact tax-invoice title, company panel, invoice/delivery metadata grid, consignee and buyer sections, detailed goods table, GST summary, amount-in-words, declaration, and authorised-signatory footer.
- Use the Zizz logo already stored in the ERP and replace the placeholder company information with the verified Abood Tradings details shown in the supplied invoice.
- Keep customer/party information confined to the Bill To and Ship To sections; company identity, GST registration, address, email, declaration, and signing block will come from the central company configuration.
- Make this design the default for invoice previews, printing, PDF export, and invoice links, while keeping invoice creation, calculations, permissions, and notifications unchanged.

## Technical details
- Update the central print company configuration with the reference's verified company identity and statutory details; do not invent missing phone, bank, or payment information.
- Add a dedicated reference-style invoice layout rather than altering purchase bills, ledgers, or other printable documents.
- Derive GST rows and totals from existing invoice/item data, and add a safe INR amount-to-words formatter for displayed totals.
- Verify TypeScript and the production build, then visually inspect a rendered invoice at A4 dimensions.
