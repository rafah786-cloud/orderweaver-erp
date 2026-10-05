# Project architecture decisions

- Keep Phase 1 and Phase 2 accounting migrations unapplied until a verified restorable recovery point exists; the current shared database has no proven isolated restore.
- Keep accounting imports separate from the legacy Tally master importer; it cannot atomically retain every voucher leg or bill allocation, so uploaded accounting data must fail closed rather than appear imported.
- Run Tally source integrity checks as pure read-only parsing before any accounting import; unresolved source identifiers and imbalances must be reported, not repaired or guessed.
- Expose ERP agent tools through OAuth with the caller's verified token and RLS, and check approved account roles for business reads, so external assistants never inherit privileged access.
