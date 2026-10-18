-- Zizz public website enquiries.
-- Public visitors may create an enquiry only through the validated server route.
-- ERP reads and updates remain company-scoped and limited to Admin/Sales roles.

CREATE TABLE IF NOT EXISTS public.website_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text NOT NULL UNIQUE
    DEFAULT ('ZE-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  customer_name text NOT NULL CHECK (length(trim(customer_name)) BETWEEN 2 AND 100),
  phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  enquiry_type text NOT NULL CHECK (enquiry_type IN ('general','guidance','product','custom','business','warranty','tracking')),
  model_name text,
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 4000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed','spam')),
  response_notes text CHECK (response_notes IS NULL OR length(response_notes) <= 4000),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'zizz_website',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_enquiries_company_created_idx
  ON public.website_enquiries (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS website_enquiries_company_status_created_idx
  ON public.website_enquiries (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS website_enquiries_company_phone_created_idx
  ON public.website_enquiries (company_id, phone, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_website_enquiry_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS website_enquiries_touch_updated_at ON public.website_enquiries;
CREATE TRIGGER website_enquiries_touch_updated_at
  BEFORE UPDATE ON public.website_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.touch_website_enquiry_updated_at();

ALTER TABLE public.website_enquiries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.website_enquiries FROM anon, authenticated;
GRANT SELECT ON TABLE public.website_enquiries TO authenticated;
GRANT UPDATE (status, response_notes, assigned_to) ON TABLE public.website_enquiries TO authenticated;
GRANT ALL ON TABLE public.website_enquiries TO service_role;

DROP POLICY IF EXISTS website_enquiries_sales_admin_read ON public.website_enquiries;
CREATE POLICY website_enquiries_sales_admin_read
  ON public.website_enquiries
  FOR SELECT TO authenticated
  USING (
    is_approved(auth.uid())
    AND company_id = current_company_id()
    AND has_company_access(company_id)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
    )
  );

DROP POLICY IF EXISTS website_enquiries_sales_admin_update ON public.website_enquiries;
CREATE POLICY website_enquiries_sales_admin_update
  ON public.website_enquiries
  FOR UPDATE TO authenticated
  USING (
    is_approved(auth.uid())
    AND company_id = current_company_id()
    AND has_company_access(company_id)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
    )
  )
  WITH CHECK (
    is_approved(auth.uid())
    AND company_id = current_company_id()
    AND has_company_access(company_id)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
    )
  );

COMMENT ON TABLE public.website_enquiries IS
  'Website enquiry inbox. Public submissions are accepted only by the server-side validated endpoint; authenticated access is restricted to approved Admin/Sales users in the active company.';
