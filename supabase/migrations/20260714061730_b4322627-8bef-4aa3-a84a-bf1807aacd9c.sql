
-- De-duplicate any existing rows before adding unique indexes
DELETE FROM public.party_ledger_entries a
USING public.party_ledger_entries b
WHERE a.ctid < b.ctid AND a.external_ref = b.external_ref AND a.external_ref IS NOT NULL;

DELETE FROM public.supplier_ledger_entries a
USING public.supplier_ledger_entries b
WHERE a.ctid < b.ctid AND a.external_ref = b.external_ref AND a.external_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS party_ledger_entries_external_ref_uq
  ON public.party_ledger_entries (external_ref)
  WHERE external_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_ledger_entries_external_ref_uq
  ON public.supplier_ledger_entries (external_ref)
  WHERE external_ref IS NOT NULL;
