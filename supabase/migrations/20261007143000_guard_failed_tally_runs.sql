BEGIN;

-- A failed Tally migration run is terminal. Validation must never be able to
-- turn a partially staged/failed run into a validated or approved run.
-- A database trigger is used so this invariant also holds if another code
-- path calls validate_tally_migration_run directly.
CREATE OR REPLACE FUNCTION public.guard_failed_tally_migration_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'failed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Failed Tally migration runs are immutable; create a new run';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_failed_tally_migration_run
ON public.tally_migration_runs;

CREATE TRIGGER guard_failed_tally_migration_run
BEFORE UPDATE OF status ON public.tally_migration_runs
FOR EACH ROW
EXECUTE FUNCTION public.guard_failed_tally_migration_run();

REVOKE ALL ON FUNCTION public.guard_failed_tally_migration_run() FROM PUBLIC, anon, authenticated;

COMMIT;
