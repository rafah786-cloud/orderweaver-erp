-- Bind biometric devices to the active legal/company book.
BEGIN;

ALTER TABLE public.device_settings
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.device_settings d
SET company_id = c.id
FROM public.companies c
WHERE d.company_id IS NULL
  AND c.is_default = true;

CREATE INDEX IF NOT EXISTS idx_device_settings_company_id
  ON public.device_settings(company_id);

-- Do not allow companyless devices after the migration has had a chance to
-- backfill the existing default-company devices.
ALTER TABLE public.device_settings
  ALTER COLUMN company_id SET NOT NULL;

-- Replace the old global device policies with company-scoped access.
DROP POLICY IF EXISTS "device admin read" ON public.device_settings;
DROP POLICY IF EXISTS "device admin write" ON public.device_settings;

CREATE POLICY "device admin read active company"
  ON public.device_settings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND company_id = public.current_company_id()
    AND public.has_company_access(company_id)
  );

CREATE POLICY "device admin write active company"
  ON public.device_settings FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND company_id = public.current_company_id()
    AND public.has_company_access(company_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND company_id = public.current_company_id()
    AND public.has_company_access(company_id)
  );

COMMIT;
