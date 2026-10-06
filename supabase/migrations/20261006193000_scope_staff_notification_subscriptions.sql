BEGIN;

-- Staff notification subscriptions are company-specific. Preserve any legacy
-- rows under ABOOD, then replicate the existing defaults to the other approved books.
DO $$
BEGIN
  IF to_regclass('public.employee_notification_subscriptions') IS NULL THEN
    CREATE TABLE public.employee_notification_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES public.companies(id),
      department text NOT NULL,
      event_key text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    ALTER TABLE public.employee_notification_subscriptions
      ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

    UPDATE public.employee_notification_subscriptions
    SET company_id=(SELECT id FROM public.companies WHERE code='ABOOD')
    WHERE company_id IS NULL;

    ALTER TABLE public.employee_notification_subscriptions
      ALTER COLUMN company_id SET NOT NULL;

    ALTER TABLE public.employee_notification_subscriptions
      DROP CONSTRAINT IF EXISTS employee_notification_subscriptions_department_event_key_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS employee_notification_subscriptions_company_department_event_key
  ON public.employee_notification_subscriptions(company_id,department,event_key);

-- Seed all four books from the intended default subscription matrix.
INSERT INTO public.employee_notification_subscriptions(company_id,department,event_key,is_active)
SELECT c.id,v.department,v.event_key,true
FROM public.companies c
CROSS JOIN (
  VALUES
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
WHERE c.code IN ('ABOOD','ABRAZ','ABOOD_MGMT','ABRAZ_MGMT')
ON CONFLICT (company_id,department,event_key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_notification_subscriptions TO authenticated;
GRANT ALL ON public.employee_notification_subscriptions TO service_role;

ALTER TABLE public.employee_notification_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ens read auth" ON public.employee_notification_subscriptions;
DROP POLICY IF EXISTS "ens write admin/hr" ON public.employee_notification_subscriptions;
DROP POLICY IF EXISTS "ens company scope" ON public.employee_notification_subscriptions;

CREATE POLICY "ens company scope"
  ON public.employee_notification_subscriptions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    company_id=public.current_company_id()
    AND public.has_company_access(company_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  )
  WITH CHECK (
    company_id=public.current_company_id()
    AND public.has_company_access(company_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  );

DROP TRIGGER IF EXISTS ens_touch_updated_at ON public.employee_notification_subscriptions;
CREATE TRIGGER ens_touch_updated_at
  BEFORE UPDATE ON public.employee_notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMIT;
