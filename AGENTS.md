# Project architecture decisions

- Keep Phase 1 and Phase 2 accounting migrations unapplied until a verified restorable recovery point exists; the current shared database has no proven isolated restore.
- Keep accounting imports separate from the legacy Tally master importer; it cannot atomically retain every voucher leg or bill allocation, so uploaded accounting data must fail closed rather than appear imported.
- Derive outbound customer-alert contents from saved business records and active templates, not caller variables, because messaging endpoints are callable independently of the screens that invoke them.
- Restrict WhatsApp configuration tests to the configured business number and generate outbound purchase links from the approved first-party domain, because caller-supplied destinations can be abused.
- Run Tally source integrity checks as pure read-only parsing before any accounting import; unresolved source identifiers and imbalances must be reported, not repaired or guessed.