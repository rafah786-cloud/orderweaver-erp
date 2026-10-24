BEGIN;

-- Harden company boundaries at the database policy layer for records that
-- previously relied only on permissive role policies.

ALTER TABLE public.employee_notification_subscriptions
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
UPDATE public.employee_notification_subscriptions
SET company_id = (SELECT id FROM public.companies WHERE code='ABOOD')
WHERE company_id IS NULL;
ALTER TABLE public.employee_notification_subscriptions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.employee_notification_subscriptions
  DROP CONSTRAINT IF EXISTS employee_notification_subscriptions_department_event_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS employee_notification_subscriptions_company_department_event_key
  ON public.employee_notification_subscriptions(company_id,department,event_key);

INSERT INTO public.employee_notification_subscriptions(company_id,department,event_key,is_active)
SELECT c.id,v.department,v.event_key,true
FROM public.companies c
CROSS JOIN (VALUES
  ('Sales','staff.sales_order.created'),
  ('Sales','staff.dispatch.ready'),
  ('Accounts','staff.payment.received'),
  ('Accounts','staff.invoice.overdue'),
  ('Purchase','staff.purchase_request.created'),
  ('Purchase','staff.approval.pending'),
  ('Warehouse','staff.dispatch.ready'),
  ('Management','staff.sales_order.created'),
  ('Management','staff.purchase_request.created'),
  ('Management','staff.approval.pending'),
  ('Management','staff.invoice.overdue'),
  ('Management','staff.payment.received'),
  ('Management','staff.dispatch.ready')
) v(department,event_key)
WHERE c.is_active AND c.code IN ('ABOOD','ABRAZ','ABOOD_MGMT','ABRAZ_MGMT')
ON CONFLICT (company_id,department,event_key) DO NOTHING;

DROP POLICY IF EXISTS "ens read admin/hr" ON public.employee_notification_subscriptions;
DROP POLICY IF EXISTS "ens write admin/hr" ON public.employee_notification_subscriptions;
DROP POLICY IF EXISTS "ens read auth" ON public.employee_notification_subscriptions;
DROP POLICY IF EXISTS "ens company scope" ON public.employee_notification_subscriptions;
CREATE POLICY "ens company scope"
  ON public.employee_notification_subscriptions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

ALTER TABLE public.ai_proposals
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
UPDATE public.ai_proposals p
SET company_id=COALESCE(
  (SELECT d.company_id FROM public.ai_documents d WHERE d.id=p.source_document_id),
  (SELECT pr.active_company_id FROM public.profiles pr WHERE pr.id=p.created_by),
  (SELECT id FROM public.companies WHERE code='ABOOD')
)
WHERE p.company_id IS NULL;
ALTER TABLE public.ai_proposals ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_proposals_company_id ON public.ai_proposals(company_id);
DROP POLICY IF EXISTS "ai proposals company scope" ON public.ai_proposals;
CREATE POLICY "ai proposals company scope"
  ON public.ai_proposals AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

UPDATE public.ai_documents
SET company_id=COALESCE(company_id,(SELECT id FROM public.companies WHERE code='ABOOD'))
WHERE company_id IS NULL;
UPDATE public.ai_insights
SET company_id=COALESCE(company_id,(SELECT id FROM public.companies WHERE code='ABOOD'))
WHERE company_id IS NULL;

DROP POLICY IF EXISTS "ai documents company scope" ON public.ai_documents;
CREATE POLICY "ai documents company scope"
  ON public.ai_documents AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "ai insights company scope" ON public.ai_insights;
CREATE POLICY "ai insights company scope"
  ON public.ai_insights AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "device company scope" ON public.device_settings;
CREATE POLICY "device company scope"
  ON public.device_settings AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

-- The Tally migration-control tables are referenced by this and later
-- authoritative migrations, but their original CREATE TABLE definitions were
-- absent from the CLI migration chain. Create the staging/control-plane schema
-- before installing the existing company-boundary policies below.
CREATE TABLE IF NOT EXISTS public.tally_migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  source_company_name text,
  source_company_guid text,
  source_checksum text,
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','validated','approved','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  notes text,
  control_totals jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS tally_migration_runs_company_started_idx
  ON public.tally_migration_runs(company_id,started_at DESC);
CREATE INDEX IF NOT EXISTS tally_migration_runs_status_idx
  ON public.tally_migration_runs(company_id,status);

CREATE TABLE IF NOT EXISTS public.tally_migration_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tally_migration_runs(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  record_type text NOT NULL CHECK (length(record_type) BETWEEN 1 AND 64),
  source_id text,
  alter_id text,
  source_key text NOT NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'posted'
    CHECK (lifecycle_state IN ('posted','cancelled','optional','deleted')),
  parent_source_key text,
  canonical_id uuid,
  canonical_status text NOT NULL DEFAULT 'staged',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,record_type,source_key)
);
CREATE INDEX IF NOT EXISTS tally_migration_rows_run_type_idx
  ON public.tally_migration_rows(run_id,company_id,record_type);
CREATE INDEX IF NOT EXISTS tally_migration_rows_source_id_idx
  ON public.tally_migration_rows(company_id,record_type,source_id);
CREATE INDEX IF NOT EXISTS tally_migration_rows_alter_id_idx
  ON public.tally_migration_rows(company_id,record_type,alter_id);

CREATE TABLE IF NOT EXISTS public.tally_migration_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tally_migration_runs(id) ON DELETE RESTRICT,
  row_id uuid REFERENCES public.tally_migration_rows(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  code text NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tally_migration_issues_run_severity_idx
  ON public.tally_migration_issues(run_id,company_id,severity,resolved);
CREATE INDEX IF NOT EXISTS tally_migration_issues_row_idx
  ON public.tally_migration_issues(row_id);

CREATE TABLE IF NOT EXISTS public.tally_reconciliation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.tally_migration_runs(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  as_of_date date NOT NULL,
  control_type text NOT NULL,
  tally_value numeric,
  erp_value numeric,
  difference numeric,
  tolerance numeric NOT NULL DEFAULT 0.01 CHECK (tolerance >= 0),
  status text NOT NULL DEFAULT 'difference' CHECK (status IN ('match','difference')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tally_reconciliation_snapshots_run_idx
  ON public.tally_reconciliation_snapshots(run_id,company_id,as_of_date);

-- Prevent a privileged client path from attaching a row, issue, or snapshot to
-- a migration run belonging to another company.
CREATE OR REPLACE FUNCTION public.enforce_tally_migration_company_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE parent_company uuid; linked_row_company uuid;
BEGIN
  IF NEW.run_id IS NOT NULL THEN
    SELECT r.company_id INTO parent_company
    FROM public.tally_migration_runs r WHERE r.id=NEW.run_id;
    IF parent_company IS NULL OR parent_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Tally migration child record must match its parent run company';
    END IF;
  END IF;
  IF TG_TABLE_NAME='tally_migration_issues' AND NEW.row_id IS NOT NULL THEN
    SELECT mr.company_id INTO linked_row_company
    FROM public.tally_migration_rows mr WHERE mr.id=NEW.row_id;
    IF linked_row_company IS NULL OR linked_row_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Tally migration issue row must match its company';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tally_migration_rows_company_guard ON public.tally_migration_rows;
CREATE TRIGGER tally_migration_rows_company_guard
  BEFORE INSERT OR UPDATE ON public.tally_migration_rows
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tally_migration_company_scope();
DROP TRIGGER IF EXISTS tally_migration_issues_company_guard ON public.tally_migration_issues;
CREATE TRIGGER tally_migration_issues_company_guard
  BEFORE INSERT OR UPDATE ON public.tally_migration_issues
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tally_migration_company_scope();
DROP TRIGGER IF EXISTS tally_reconciliation_snapshots_company_guard ON public.tally_reconciliation_snapshots;
CREATE TRIGGER tally_reconciliation_snapshots_company_guard
  BEFORE INSERT OR UPDATE ON public.tally_reconciliation_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tally_migration_company_scope();

ALTER TABLE public.tally_migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_migration_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_migration_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_reconciliation_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tally_migration_runs, public.tally_migration_rows,
  public.tally_migration_issues, public.tally_reconciliation_snapshots FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tally_migration_runs,
  public.tally_migration_rows, public.tally_migration_issues,
  public.tally_reconciliation_snapshots TO authenticated;
GRANT ALL ON public.tally_migration_runs, public.tally_migration_rows,
  public.tally_migration_issues, public.tally_reconciliation_snapshots TO service_role;

-- Permissive access is Admin-only; the restrictive policies added below also
-- require current-company membership. This lets the existing authenticated
-- server-side staging handlers work without opening these tables to other roles.
DROP POLICY IF EXISTS "tally runs admin access" ON public.tally_migration_runs;
CREATE POLICY "tally runs admin access" ON public.tally_migration_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id=public.current_company_id()
    AND public.has_company_access(company_id))
  WITH CHECK (public.has_role(auth.uid(),'admin') AND company_id=public.current_company_id()
    AND public.has_company_access(company_id));
DROP POLICY IF EXISTS "tally rows admin access" ON public.tally_migration_rows;
CREATE POLICY "tally rows admin access" ON public.tally_migration_rows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id=public.current_company_id()
    AND public.has_company_access(company_id))
  WITH CHECK (public.has_role(auth.uid(),'admin') AND company_id=public.current_company_id()
    AND public.has_company_access(company_id));
DROP POLICY IF EXISTS "tally issues admin access" ON public.tally_migration_issues;
CREATE POLICY "tally issues admin access" ON public.tally_migration_issues
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id=public.current_company_id()
    AND public.has_company_access(company_id))
  WITH CHECK (public.has_role(auth.uid(),'admin') AND company_id=public.current_company_id()
    AND public.has_company_access(company_id));
DROP POLICY IF EXISTS "tally reconciliation admin access" ON public.tally_reconciliation_snapshots;
CREATE POLICY "tally reconciliation admin access" ON public.tally_reconciliation_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id=public.current_company_id()
    AND public.has_company_access(company_id))
  WITH CHECK (public.has_role(auth.uid(),'admin') AND company_id=public.current_company_id()
    AND public.has_company_access(company_id));

REVOKE ALL ON FUNCTION public.enforce_tally_migration_company_scope() FROM PUBLIC,anon,authenticated;

DROP POLICY IF EXISTS "tally runs company scope" ON public.tally_migration_runs;
CREATE POLICY "tally runs company scope"
  ON public.tally_migration_runs AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "tally rows company scope" ON public.tally_migration_rows;
CREATE POLICY "tally rows company scope"
  ON public.tally_migration_rows AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "tally issues company scope" ON public.tally_migration_issues;
CREATE POLICY "tally issues company scope"
  ON public.tally_migration_issues AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tally_migration_runs r
    WHERE r.id=tally_migration_issues.run_id
      AND r.company_id=public.current_company_id()
      AND public.has_company_access(r.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tally_migration_runs r
    WHERE r.id=tally_migration_issues.run_id
      AND r.company_id=public.current_company_id()
      AND public.has_company_access(r.company_id)
  ));

DROP POLICY IF EXISTS "tally snapshots company scope" ON public.tally_reconciliation_snapshots;
CREATE POLICY "tally snapshots company scope"
  ON public.tally_reconciliation_snapshots AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "vendor invites company scope" ON public.vendor_invites;
CREATE POLICY "vendor invites company scope"
  ON public.vendor_invites AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id=vendor_invites.supplier_id
      AND s.company_id=public.current_company_id()
      AND public.has_company_access(s.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id=vendor_invites.supplier_id
      AND s.company_id=public.current_company_id()
      AND public.has_company_access(s.company_id)
  ));

DROP POLICY IF EXISTS "notification log company scope" ON public.notification_log;
CREATE POLICY "notification log company scope"
  ON public.notification_log AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    (party_kind='customer' AND EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id=notification_log.party_id
        AND p.company_id=public.current_company_id()
        AND public.has_company_access(p.company_id)
    ))
    OR
    (party_kind='vendor' AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id=notification_log.party_id
        AND s.company_id=public.current_company_id()
        AND public.has_company_access(s.company_id)
    ))
    OR
    (party_kind IN ('staff','admin') AND EXISTS (
      SELECT 1 FROM public.user_company_access a
      WHERE a.user_id=notification_log.party_id
        AND a.company_id=public.current_company_id()
        AND a.can_view
    ))
  )
  WITH CHECK (
    (party_kind='customer' AND EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id=notification_log.party_id
        AND p.company_id=public.current_company_id()
        AND public.has_company_access(p.company_id)
    ))
    OR
    (party_kind='vendor' AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id=notification_log.party_id
        AND s.company_id=public.current_company_id()
        AND public.has_company_access(s.company_id)
    ))
    OR
    (party_kind IN ('staff','admin') AND EXISTS (
      SELECT 1 FROM public.user_company_access a
      WHERE a.user_id=notification_log.party_id
        AND a.company_id=public.current_company_id()
        AND a.can_view
    ))
  );

COMMIT;
