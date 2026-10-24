\set ON_ERROR_STOP on
DO $test$
DECLARE
  t text;
  p text;
  fn record;
BEGIN
  FOREACH t IN ARRAY ARRAY['bills','bill_allocations'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Missing public.%', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'RLS disabled on public.%', t; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='company_id'
    ) THEN RAISE EXCEPTION 'company_id missing on public.%', t; END IF;
    IF NOT has_table_privilege('authenticated','public.'||t,'SELECT') THEN
      RAISE EXCEPTION 'Authenticated SELECT missing on public.%', t;
    END IF;
    FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('authenticated','public.'||t,p) THEN
        RAISE EXCEPTION 'Authenticated direct % privilege on public.%', p, t;
      END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('anon','public.'||t,p) THEN
        RAISE EXCEPTION 'Anon % privilege on public.%', p, t;
      END IF;
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND policyname=('company_scope_'||t)
        AND COALESCE(qual,'') ILIKE '%current_company_id%'
        AND COALESCE(qual,'') ILIKE '%has_company_access%'
        AND COALESCE(with_check,'') ILIKE '%current_company_id%'
        AND COALESCE(with_check,'') ILIKE '%has_company_access%'
    ) THEN RAISE EXCEPTION 'Restrictive company policy missing/incomplete on public.%', t; END IF;
  END LOOP;
  -- The Tally staging/reconciliation control plane must be company-isolated too.
  FOREACH t IN ARRAY ARRAY[
    'tally_migration_runs','tally_migration_rows','tally_migration_issues','tally_reconciliation_snapshots'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Missing Tally migration control table public.%', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'RLS disabled on Tally control table public.%', t; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='company_id'
    ) THEN RAISE EXCEPTION 'company_id missing on Tally control table public.%', t; END IF;
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('anon','public.'||t,p) THEN
        RAISE EXCEPTION 'Anon unexpectedly has % privilege on Tally control table public.%',p,t;
      END IF;
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND permissive='RESTRICTIVE'
        AND COALESCE(qual,'') ILIKE '%current_company_id%'
        AND COALESCE(qual,'') ILIKE '%has_company_access%'
        AND COALESCE(with_check,'') ILIKE '%current_company_id%'
        AND COALESCE(with_check,'') ILIKE '%has_company_access%'
    ) THEN RAISE EXCEPTION 'Restrictive company boundary missing on Tally control table public.%',t; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND permissive='PERMISSIVE'
        AND COALESCE(qual,'') ILIKE '%has_role%'
        AND COALESCE(with_check,'') ILIKE '%has_role%'
    ) THEN RAISE EXCEPTION 'Admin-only permissive policy missing on Tally control table public.%',t; END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tr
    JOIN pg_class cl ON cl.oid=tr.tgrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    WHERE ns.nspname='public' AND cl.relname='tally_migration_rows'
      AND tr.tgname='tally_migration_rows_company_guard' AND NOT tr.tgisinternal
  ) THEN RAISE EXCEPTION 'Tally migration row cross-company guard trigger missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tr
    JOIN pg_class cl ON cl.oid=tr.tgrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    WHERE ns.nspname='public' AND cl.relname='tally_migration_issues'
      AND tr.tgname='tally_migration_issues_company_guard' AND NOT tr.tgisinternal
  ) THEN RAISE EXCEPTION 'Tally migration issue cross-company guard trigger missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tr
    JOIN pg_class cl ON cl.oid=tr.tgrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    WHERE ns.nspname='public' AND cl.relname='tally_migration_runs'
      AND tr.tgname='guard_failed_tally_migration_run' AND NOT tr.tgisinternal
  ) THEN RAISE EXCEPTION 'Failed Tally migration-run terminal-state guard missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tr
    JOIN pg_class cl ON cl.oid=tr.tgrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    WHERE ns.nspname='public' AND cl.relname='tally_migration_runs'
      AND tr.tgname='guard_tally_approval_control_totals' AND NOT tr.tgisinternal
  ) THEN RAISE EXCEPTION 'Tally approval control-total guard missing'; END IF;

  -- Stock journal headers and lines must share an enforced company scope.
  FOREACH t IN ARRAY ARRAY['stock_journals','stock_journal_entries'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN
      RAISE EXCEPTION 'Missing stock journal table public.%',t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'RLS disabled on public.%',t; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='company_id'
    ) THEN RAISE EXCEPTION 'company_id missing on public.%',t; END IF;
    IF NOT has_table_privilege('authenticated','public.'||t,'SELECT') THEN
      RAISE EXCEPTION 'Authenticated SELECT missing on public.%',t;
    END IF;
    FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('authenticated','public.'||t,p) THEN
        RAISE EXCEPTION 'Authenticated direct % privilege remains on public.%',p,t;
      END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('anon','public.'||t,p) THEN
        RAISE EXCEPTION 'Anon unexpectedly has % privilege on public.%',p,t;
      END IF;
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND permissive='RESTRICTIVE'
        AND COALESCE(qual,'') ILIKE '%current_company_id%'
        AND COALESCE(qual,'') ILIKE '%has_company_access%'
        AND COALESCE(with_check,'') ILIKE '%current_company_id%'
        AND COALESCE(with_check,'') ILIKE '%has_company_access%'
    ) THEN RAISE EXCEPTION 'Restrictive company boundary missing on stock journal table public.%',t; END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tr
    JOIN pg_class cl ON cl.oid=tr.tgrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    WHERE ns.nspname='public' AND cl.relname='stock_journal_entries'
      AND tr.tgname='stock_journal_entry_company_guard' AND NOT tr.tgisinternal
  ) THEN RAISE EXCEPTION 'Stock journal entry parent/item/godown company guard is missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_stock_journal'
      AND p.prosecdef
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION 'Canonical stock journal posting RPC is not granted to authenticated'; END IF;

  IF to_regclass('public.erp_domain_audit_log') IS NULL THEN
    RAISE EXCEPTION 'Enterprise domain audit sink is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='audit_enterprise_domain_change'
      AND p.prorettype='trigger'::regtype AND p.prosecdef
  ) THEN RAISE EXCEPTION 'Enterprise domain audit trigger function is missing or not SECURITY DEFINER'; END IF;
  IF has_function_privilege('authenticated','public.audit_enterprise_domain_change()','EXECUTE')
     OR has_function_privilege('anon','public.audit_enterprise_domain_change()','EXECUTE') THEN
    RAISE EXCEPTION 'Client roles can directly execute the enterprise audit trigger function';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tr
    JOIN pg_proc p ON p.oid=tr.tgfoid
    JOIN pg_class cl ON cl.oid=tr.tgrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    WHERE p.proname='audit_enterprise_domain_change'
      AND ns.nspname='public' AND cl.relname='work_centers'
      AND NOT tr.tgisinternal
  ) THEN RAISE EXCEPTION 'Enterprise domain audit trigger missing on work_centers'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='bills'
      AND indexdef ILIKE '%source_voucher_entry_id%' AND indexdef ILIKE '%UNIQUE%'
  ) THEN RAISE EXCEPTION 'Bill source-entry unique guard missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='bill_allocations'
      AND indexdef ILIKE '%idempotency_key%' AND indexdef ILIKE '%UNIQUE%'
  ) THEN RAISE EXCEPTION 'Allocation idempotency index missing'; END IF;
  SELECT p.prosecdef,p.proconfig INTO fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_gl_voucher_internal'
  ORDER BY p.oid LIMIT 1;
  IF NOT FOUND OR NOT fn.prosecdef THEN
    RAISE EXCEPTION 'Canonical internal GL posting helper missing or not SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(fn.proconfig,ARRAY[]::text[])) AS setting(value)
    WHERE setting.value ILIKE 'search_path=public%'
  ) THEN RAISE EXCEPTION 'Canonical internal GL helper lacks fixed search_path'; END IF;
  IF has_function_privilege(
    'authenticated',
    'public.create_gl_voucher_internal(public.voucher_type,date,jsonb,text,text,text,uuid,text,uuid)',
    'EXECUTE'
  ) THEN RAISE EXCEPTION 'Authenticated can directly execute internal GL posting helper'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='post_bill_settlement'
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION 'Authenticated settlement RPC grant is missing'; END IF;
  RAISE NOTICE 'PASS: accounting tables, Tally staging isolation, stock-journal isolation, append-only enterprise audit, direct-DML revocations, unique keys and canonical RPC grants';
END
$test$;
SELECT 'public_tables='||count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';
SELECT 'migration_count='||count(*) FROM supabase_migrations.schema_migrations;
