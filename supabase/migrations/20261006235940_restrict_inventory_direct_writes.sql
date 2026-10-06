-- Client DML is no longer the canonical inventory write path.
REVOKE INSERT, UPDATE, DELETE ON public.stock_journals FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stock_journal_entries FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stock_movements FROM authenticated;
