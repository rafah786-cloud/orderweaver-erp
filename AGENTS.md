# Project architecture decisions

- Keep Phase 1 and Phase 2 accounting migrations unapplied until a verified restorable recovery point exists; the current shared database has no proven isolated restore.
- Keep accounting imports separate from the legacy Tally master importer; it cannot atomically retain every voucher leg or bill allocation, so uploaded accounting data must fail closed rather than appear imported.
- Run Tally source integrity checks as pure read-only parsing before any accounting import; unresolved source identifiers and imbalances must be reported, not repaired or guessed.
- Expose ERP agent tools through OAuth with the caller's verified token and RLS, and check approved account roles for business reads, so external assistants never inherit privileged access.
- Notification event activation and delivery configuration require a server-verified admin role through the caller's authenticated client; the communications settings are admin-only.
- Customer alerts, purchase notices and supplier-name enrichment in staff alerts must read targeted business records through the caller's authenticated client and existing RLS; privileged delivery must not widen record visibility.
- Promotional broadcasts use a single resolved active template and saved recipient variables, never caller-written content or freeform fallback; template changes must not reopen arbitrary-message delivery.
- Accounting preflight responses use fixed safe failure messages rather than database diagnostics, so read-only admin checks never expose internal error details.
- Shared components access web push through an isomorphic facade that dynamically loads browser-only subscription code on the client, so SSR never imports client-only modules.
- AI planning and answering receive the same complete conversation history; retrieval failures abort generation rather than substituting unrelated business snapshots.
- AI audit company attribution is resolved through the caller's authenticated client and current company; unverifiable attribution is skipped rather than assigned a default tenant.
