-- Give stock journal headers and lines an explicit, enforced company boundary.
-- The original line table did not have company_id, although later canonical
-- posting functions already insert it and this migration attempted to read it.
BEGIN;

ALTER TABLE public.stock_journals
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE public.stock_journal_entries
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Legacy lines derive their book from the referenced stock item first. The
-- creator's active company is only a fallback for any legacy item without one.
UPDATE public.stock_journal_entries e
SET company_id = COALESCE(
  (SELECT si.company_id FROM public.stock_items si WHERE si.id=e.stock_item_id),
  (SELECT p.active_company_id
   FROM public.stock_journals j
   JOIN public.profiles p ON p.id=j.created_by
   WHERE j.id=e.journal_id)
)
WHERE e.company_id IS NULL;

DO $stock_journal_entry_company$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.stock_journal_entries e
    WHERE e.company_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Unresolved company on stock journal entry; manual attribution is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_journal_entries e
    JOIN public.stock_items si ON si.id=e.stock_item_id
    WHERE si.company_id IS DISTINCT FROM e.company_id
  ) THEN
    RAISE EXCEPTION 'Stock journal line company does not match its stock item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_journal_entries e
    LEFT JOIN public.godowns g ON g.id=e.from_godown_id
    WHERE e.from_godown_id IS NOT NULL
      AND (g.id IS NULL OR g.company_id IS DISTINCT FROM e.company_id)
  ) THEN
    RAISE EXCEPTION 'Stock journal source godown has a different company';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_journal_entries e
    LEFT JOIN public.godowns g ON g.id=e.to_godown_id
    WHERE e.to_godown_id IS NOT NULL
      AND (g.id IS NULL OR g.company_id IS DISTINCT FROM e.company_id)
  ) THEN
    RAISE EXCEPTION 'Stock journal destination godown has a different company';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_journal_entries e
    GROUP BY e.journal_id
    HAVING count(DISTINCT e.company_id) > 1
  ) THEN
    RAISE EXCEPTION 'Stock journal lines contain more than one company; attribution is ambiguous';
  END IF;
END
$stock_journal_entry_company$;

ALTER TABLE public.stock_journal_entries
  ALTER COLUMN company_id SET NOT NULL;

UPDATE public.stock_journals j
SET company_id = COALESCE(
  (SELECT min(e.company_id) FROM public.stock_journal_entries e
   WHERE e.journal_id=j.id AND e.company_id IS NOT NULL),
  (SELECT p.active_company_id FROM public.profiles p WHERE p.id=j.created_by)
)
WHERE j.company_id IS NULL;

DO $stock_journal_header_company$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stock_journals WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Unresolved company on stock journal; manual attribution is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_journals j
    JOIN public.stock_journal_entries e ON e.journal_id=j.id
    WHERE j.company_id IS DISTINCT FROM e.company_id
  ) THEN
    RAISE EXCEPTION 'Stock journal header and child lines have different companies';
  END IF;
END
$stock_journal_header_company$;

ALTER TABLE public.stock_journals ALTER COLUMN company_id SET NOT NULL;
DROP INDEX IF EXISTS public.stock_journals_journal_number_key;
ALTER TABLE public.stock_journals
  ADD CONSTRAINT stock_journals_company_number_key UNIQUE (company_id, journal_number);

CREATE INDEX IF NOT EXISTS idx_stock_journals_company_date
  ON public.stock_journals(company_id, journal_date);
CREATE INDEX IF NOT EXISTS idx_stock_journal_entries_company_journal
  ON public.stock_journal_entries(company_id, journal_id);
CREATE INDEX IF NOT EXISTS idx_stock_journal_entries_company_item
  ON public.stock_journal_entries(company_id, stock_item_id);

CREATE OR REPLACE FUNCTION public.enforce_stock_journal_entry_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  parent_company uuid;
  item_company uuid;
  source_godown_company uuid;
  destination_godown_company uuid;
BEGIN
  SELECT j.company_id INTO parent_company
  FROM public.stock_journals j WHERE j.id=NEW.journal_id;
  IF parent_company IS NULL OR parent_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Stock journal line must match its parent journal company';
  END IF;

  SELECT si.company_id INTO item_company
  FROM public.stock_items si WHERE si.id=NEW.stock_item_id;
  IF item_company IS NULL OR item_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Stock journal line item must belong to the same company';
  END IF;

  IF NEW.from_godown_id IS NOT NULL THEN
    SELECT g.company_id INTO source_godown_company
    FROM public.godowns g WHERE g.id=NEW.from_godown_id;
    IF source_godown_company IS NULL OR source_godown_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Stock journal source godown must belong to the same company';
    END IF;
  END IF;

  IF NEW.to_godown_id IS NOT NULL THEN
    SELECT g.company_id INTO destination_godown_company
    FROM public.godowns g WHERE g.id=NEW.to_godown_id;
    IF destination_godown_company IS NULL OR destination_godown_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Stock journal destination godown must belong to the same company';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS stock_journal_entry_company_guard ON public.stock_journal_entries;
CREATE TRIGGER stock_journal_entry_company_guard
  BEFORE INSERT OR UPDATE ON public.stock_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stock_journal_entry_company();

ALTER TABLE public.stock_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock journals company scope" ON public.stock_journals;
CREATE POLICY "stock journals company scope"
  ON public.stock_journals AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "stock journal entries company scope" ON public.stock_journal_entries;
CREATE POLICY "stock journal entries company scope"
  ON public.stock_journal_entries AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

-- Journals and journal lines are written through canonical SECURITY DEFINER
-- posting routines. Users can read the active company's journals but cannot
-- bypass the stock movement ledger by inserting or altering child rows.
REVOKE ALL ON public.stock_journals, public.stock_journal_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.stock_journals, public.stock_journal_entries FROM authenticated;
GRANT SELECT ON public.stock_journals, public.stock_journal_entries TO authenticated;
GRANT ALL ON public.stock_journals, public.stock_journal_entries TO service_role;
REVOKE ALL ON FUNCTION public.enforce_stock_journal_entry_company() FROM PUBLIC, anon, authenticated;

COMMIT;
