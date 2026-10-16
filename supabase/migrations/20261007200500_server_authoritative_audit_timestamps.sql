-- Server-authoritative audit timestamps
-- All tables that expose created_at/updated_at get DB-clock timestamps.
-- Business/document dates remain application/domain fields and are not changed.

CREATE OR REPLACE FUNCTION public.enforce_server_audit_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.columns u
      ON u.table_schema = c.table_schema
     AND u.table_name = c.table_name
     AND u.column_name = 'updated_at'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'created_at'
      AND c.data_type = 'timestamp with time zone'
      AND u.data_type = 'timestamp with time zone'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      'trg_server_audit_timestamps', r.table_schema, r.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I
       BEFORE INSERT OR UPDATE ON %I.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.enforce_server_audit_timestamps()',
      'trg_server_audit_timestamps', r.table_schema, r.table_name
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.enforce_server_audit_timestamps() IS
'Keeps created_at immutable and makes created_at/updated_at authoritative to the PostgreSQL server clock. Business/document dates are intentionally unaffected.';


-- Event timestamps that represent state transitions are also database-clock authoritative.
CREATE OR REPLACE FUNCTION public.enforce_profile_approval_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      NEW.approved_at := now();
    ELSE
      NEW.approved_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_approval_timestamp ON public.profiles;
CREATE TRIGGER trg_profile_approval_timestamp
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_approval_timestamp();

CREATE OR REPLACE FUNCTION public.enforce_notification_read_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.read_at IS NULL
     AND NEW.read_at IS NOT NULL THEN
    NEW.read_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_read_timestamp ON public.in_app_notifications;
CREATE TRIGGER trg_notification_read_timestamp
BEFORE UPDATE ON public.in_app_notifications
FOR EACH ROW
EXECUTE FUNCTION public.enforce_notification_read_timestamp();
