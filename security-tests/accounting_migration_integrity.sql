\set ON_ERROR_STOP on
DO $test$
DECLARE t text; p text; fn record;
BEGIN
  FOREACH t IN ARRAY ARRAY['bills','bill_allocations'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Missing public.%', t; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity) THEN RAISE EXCEPTION 'RLS disabled on public.%',t; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='company_id') THEN RAISE EXCEPTION 'company_id missing on public.%',t; END IF;
    IF NOT has_table_privilege('authenticated','public.'||t,'SELECT') THEN RAISE EXCEPTION 'Authenticated SELECT missing on public.%',t; END IF;
    FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('authenticated','public.'||t,p) THEN RAISE EXCEPTION 'Authenticated direct % privilege on public.%',p,t; END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('anon','public.'||t,p) THEN RAISE EXCEPTION 'Anon % privilege on public.%',p,t; END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=('company_scope_'||t)
       AND COALESCE(qual,'') ILIKE '%current_company_id%' AND COALESCE(qual,'') ILIKE '%has_company_access%'
       AND COALESCE(with_check,'') ILIKE '%current_company_id%' AND COALESCE(with_check,'') ILIKE '%has_company_access%') THEN
      RAISE EXCEPTION 'Restrictive company policy missing/incomplete on public.%',t;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='bills' AND indexdef ILIKE '%source_voucher_entry_id%' AND indexdef ILIKE '%UNIQUE%') THEN RAISE EXCEPTION 'Bill source-entry unique guard missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='bill_allocations' AND indexdef ILIKE '%idempotency_key%' AND indexdef ILIKE '%UNIQUE%') THEN RAISE EXCEPTION 'Allocation idempotency index missing'; END IF;
  SELECT p.prosecdef,p.proconfig INTO fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_gl_voucher_internal' ORDER BY p.oid LIMIT 1;
  IF NOT FOUND OR NOT fn.prosecdef THEN RAISE EXCEPTION 'Canonical internal GL posting helper missing or not SECURITY DEFINER'; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(COALESCE(fn.proconfig,ARRAY[]::text[])) AS setting(value) WHERE setting.value ILIKE 'search_path=public%') THEN RAISE EXCEPTION 'Canonical internal GL helper lacks fixed search_path'; END IF;
  IF has_function_privilege('authenticated','public.create_gl_voucher_internal(public.voucher_type,date,jsonb,text,text,text,uuid,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Authenticated can directly execute internal GL posting helper'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='post_bill_settlement' AND has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'No authenticated grant for post_bill_settlement RPC'; END IF;
  RAISE NOTICE 'PASS: schema, RLS, grants, company policies, idempotency and canonical posting RPC';
END
$test$;
SELECT 'public_tables='||count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';
SELECT 'migration_count='||count(*) FROM supabase_migrations.schema_migrations;
