BEGIN;

ALTER TABLE public.shift_settings
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
UPDATE public.shift_settings
SET company_id=(SELECT id FROM public.companies WHERE code='ABOOD')
WHERE company_id IS NULL;
ALTER TABLE public.shift_settings ALTER COLUMN company_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shift_settings_company_unique ON public.shift_settings(company_id);

INSERT INTO public.shift_settings(
  company_id,shift_start,shift_end,late_grace_minutes,half_day_hours,
  late_deduction_pct,half_day_deduction_pct,working_days_per_month
)
SELECT c.id,s.shift_start,s.shift_end,s.late_grace_minutes,s.half_day_hours,
       s.late_deduction_pct,s.half_day_deduction_pct,s.working_days_per_month
FROM public.companies c
CROSS JOIN LATERAL (
  SELECT shift_start,shift_end,late_grace_minutes,half_day_hours,
         late_deduction_pct,half_day_deduction_pct,working_days_per_month
  FROM public.shift_settings
  WHERE company_id=(SELECT id FROM public.companies WHERE code='ABOOD')
  LIMIT 1
) s
WHERE c.is_active AND c.code IN ('ABRAZ','ABOOD_MGMT','ABRAZ_MGMT')
ON CONFLICT (company_id) DO NOTHING;

DROP POLICY IF EXISTS "shift read admin/hr" ON public.shift_settings;
DROP POLICY IF EXISTS "shift read" ON public.shift_settings;
DROP POLICY IF EXISTS "shift admin write" ON public.shift_settings;
DROP POLICY IF EXISTS "shift company scope" ON public.shift_settings;

CREATE POLICY "shift read admin/hr"
  ON public.shift_settings FOR SELECT TO authenticated
  USING (
    company_id=public.current_company_id()
    AND public.has_company_access(company_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  );

CREATE POLICY "shift admin write"
  ON public.shift_settings FOR ALL TO authenticated
  USING (
    company_id=public.current_company_id()
    AND public.has_company_access(company_id)
    AND public.has_role(auth.uid(),'admin')
  )
  WITH CHECK (
    company_id=public.current_company_id()
    AND public.has_company_access(company_id)
    AND public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "shift company scope"
  ON public.shift_settings AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "cheque company scope" ON public.cheques;
CREATE POLICY "cheque company scope"
  ON public.cheques AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    (bank_account_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bank_accounts b
      WHERE b.id=cheques.bank_account_id AND b.company_id=public.current_company_id()
        AND public.has_company_access(b.company_id)
    ))
    OR (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id=cheques.invoice_id AND i.company_id=public.current_company_id()
        AND public.has_company_access(i.company_id)
    ))
    OR (purchase_bill_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.purchase_bills pb
      WHERE pb.id=cheques.purchase_bill_id AND pb.company_id=public.current_company_id()
        AND public.has_company_access(pb.company_id)
    ))
    OR (party_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id=cheques.party_id AND p.company_id=public.current_company_id()
        AND public.has_company_access(p.company_id)
    ))
    OR (supplier_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id=cheques.supplier_id AND s.company_id=public.current_company_id()
        AND public.has_company_access(s.company_id)
    ))
  )
  WITH CHECK (
    (bank_account_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bank_accounts b
      WHERE b.id=cheques.bank_account_id AND b.company_id=public.current_company_id()
        AND public.has_company_access(b.company_id)
    ))
    OR (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id=cheques.invoice_id AND i.company_id=public.current_company_id()
        AND public.has_company_access(i.company_id)
    ))
    OR (purchase_bill_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.purchase_bills pb
      WHERE pb.id=cheques.purchase_bill_id AND pb.company_id=public.current_company_id()
        AND public.has_company_access(pb.company_id)
    ))
    OR (party_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id=cheques.party_id AND p.company_id=public.current_company_id()
        AND public.has_company_access(p.company_id)
    ))
    OR (supplier_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id=cheques.supplier_id AND s.company_id=public.current_company_id()
        AND public.has_company_access(s.company_id)
    ))
  );

-- Keep attendance derivation aligned with the employee's company-specific shift.
CREATE OR REPLACE FUNCTION public.apply_punch_to_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  s public.shift_settings%ROWTYPE;
  att_date date;
  cur public.attendance%ROWTYPE;
  late_threshold timestamptz;
  early_threshold timestamptz;
  employee_company uuid;
BEGIN
  IF NEW.employee_id IS NULL THEN RETURN NEW; END IF;
  SELECT company_id INTO employee_company FROM public.employees WHERE id=NEW.employee_id;
  SELECT * INTO s FROM public.shift_settings WHERE company_id=employee_company LIMIT 1;
  att_date := (NEW.punch_time AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT * INTO cur FROM public.attendance
  WHERE employee_id=NEW.employee_id AND attendance_date=att_date;

  IF NOT FOUND THEN
    INSERT INTO public.attendance(employee_id,attendance_date,status,first_in,last_out,in_time,out_time)
    VALUES(
      NEW.employee_id,att_date,'present',
      CASE WHEN NEW.punch_type='in' THEN NEW.punch_time END,
      CASE WHEN NEW.punch_type='out' THEN NEW.punch_time END,
      CASE WHEN NEW.punch_type='in' THEN NEW.punch_time::time END,
      CASE WHEN NEW.punch_type='out' THEN NEW.punch_time::time END
    );
  ELSE
    IF NEW.punch_type='in' AND (cur.first_in IS NULL OR NEW.punch_time<cur.first_in) THEN
      UPDATE public.attendance SET first_in=NEW.punch_time,in_time=NEW.punch_time::time WHERE id=cur.id;
    ELSIF NEW.punch_type='out' AND (cur.last_out IS NULL OR NEW.punch_time>cur.last_out) THEN
      UPDATE public.attendance SET last_out=NEW.punch_time,out_time=NEW.punch_time::time WHERE id=cur.id;
    END IF;
  END IF;

  SELECT * INTO cur FROM public.attendance
  WHERE employee_id=NEW.employee_id AND attendance_date=att_date;

  IF s.id IS NOT NULL THEN
    late_threshold := (att_date::text || ' ' || s.shift_start::text)::timestamp
      AT TIME ZONE 'Asia/Kolkata' + (s.late_grace_minutes || ' minutes')::interval;
    early_threshold := (att_date::text || ' ' || s.shift_end::text)::timestamp
      AT TIME ZONE 'Asia/Kolkata';

    UPDATE public.attendance SET
      is_late=(cur.first_in IS NOT NULL AND cur.first_in>late_threshold),
      is_early_exit=(cur.last_out IS NOT NULL AND cur.last_out<early_threshold),
      hours_worked=CASE
        WHEN cur.first_in IS NOT NULL AND cur.last_out IS NOT NULL
        THEN EXTRACT(EPOCH FROM (cur.last_out-cur.first_in))/3600.0
        ELSE 0
      END,
      is_half_day=CASE
        WHEN cur.first_in IS NOT NULL AND cur.last_out IS NOT NULL
        THEN EXTRACT(EPOCH FROM (cur.last_out-cur.first_in))/3600.0 < s.half_day_hours
        ELSE false
      END
    WHERE id=cur.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
