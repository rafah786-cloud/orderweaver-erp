-- Give stock journal headers an explicit company boundary.
BEGIN;

ALTER TABLE public.stock_journals
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.stock_journals j
SET company_id = COALESCE(
  (SELECT min(e.company_id) FROM public.stock_journal_entries e WHERE e.journal_id=j.id AND e.company_id IS NOT NULL),
  (SELECT p.active_company_id FROM public.profiles p WHERE p.id=j.created_by)
)
WHERE j.company_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stock_journals WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Unresolved company on stock journal';
  END IF;
END $$;

ALTER TABLE public.stock_journals ALTER COLUMN company_id SET NOT NULL;
DROP INDEX IF EXISTS public.stock_journals_journal_number_key;
ALTER TABLE public.stock_journals
  ADD CONSTRAINT stock_journals_company_number_key UNIQUE (company_id, journal_number);

CREATE INDEX IF NOT EXISTS idx_stock_journals_company_date
  ON public.stock_journals(company_id, journal_date);

COMMIT;
