BEGIN;

-- A migration cannot become approved if its source control totals are incomplete.
-- PostgreSQL JSONB key existence/type checks are used so a missing field cannot
-- silently COALESCE to zero during reconciliation.

CREATE OR REPLACE FUNCTION public.guard_tally_approval_control_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required_key text;
  required_keys constant text[] := ARRAY[
    'customers','vendors','ledgers','groups','stockItems',
    'godowns','costCentres','bills','vouchers',
    'voucherDebit','voucherCredit'
  ];
BEGIN
  IF NEW.status='approved' AND COALESCE(OLD.status,'') <> 'approved' THEN
    IF NEW.control_totals IS NULL OR jsonb_typeof(NEW.control_totals) <> 'object' THEN
      RAISE EXCEPTION 'Cannot approve migration without source control totals';
    END IF;

    FOREACH required_key IN ARRAY required_keys LOOP
      IF NOT (NEW.control_totals ? required_key)
         OR jsonb_typeof(NEW.control_totals -> required_key) <> 'number' THEN
        RAISE EXCEPTION 'Cannot approve migration: missing numeric control total %', required_key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_tally_approval_control_totals
  ON public.tally_migration_runs;

CREATE TRIGGER guard_tally_approval_control_totals
BEFORE UPDATE OF status,control_totals
ON public.tally_migration_runs
FOR EACH ROW
EXECUTE FUNCTION public.guard_tally_approval_control_totals();

REVOKE ALL ON FUNCTION public.guard_tally_approval_control_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_tally_approval_control_totals() FROM anon;
REVOKE ALL ON FUNCTION public.guard_tally_approval_control_totals() FROM authenticated;

COMMIT;
