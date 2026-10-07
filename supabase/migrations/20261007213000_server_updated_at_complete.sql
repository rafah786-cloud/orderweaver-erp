-- Complete server-authoritative updated_at coverage for legacy tables
-- that have updated_at but no created_at column.
CREATE OR REPLACE FUNCTION public.enforce_server_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    LEFT JOIN information_schema.columns cr
      ON cr.table_schema=c.table_schema AND cr.table_name=c.table_name AND cr.column_name='created_at'
    WHERE c.table_schema='public'
      AND c.column_name='updated_at'
      AND c.data_type='timestamp with time zone'
      AND cr.column_name IS NULL
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I','trg_server_updated_at',r.table_schema,r.table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_server_updated_at()','trg_server_updated_at',r.table_schema,r.table_name);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.enforce_server_updated_at() IS
'Keeps updated_at authoritative to the PostgreSQL server clock for legacy tables that do not have created_at.';
