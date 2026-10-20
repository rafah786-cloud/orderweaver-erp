-- Atomic generic document numbering for new/unwired document families only.
-- Existing voucher_number_series and all current voucher flows remain untouched.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ws0_number_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  branch_id uuid,
  branch_key uuid GENERATED ALWAYS AS (COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  document_type text NOT NULL CHECK (document_type ~ '^[A-Z0-9_-]{1,40}$'),
  fiscal_year text NOT NULL CHECK (fiscal_year ~ '^[0-9]{4}[-/][0-9]{2,4}$'),
  prefix text NOT NULL,
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value >= 1),
  padding smallint NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 18),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (branch_id IS NULL OR branch_id <> '00000000-0000-0000-0000-000000000000'::uuid),
  UNIQUE(company_id,branch_key,document_type,fiscal_year)
);
ALTER TABLE public.ws0_number_series ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ws0_number_series FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ws0_number_series TO authenticated;
CREATE POLICY ws0_number_series_scoped_read ON public.ws0_number_series
FOR SELECT TO authenticated
USING (public.ws0_scope_allowed(company_id,branch_id));

-- Number allocations are logged through the existing ERP audit sink; no current voucher flow is wired here.
CREATE TRIGGER ws0_audit_number_series
AFTER INSERT OR UPDATE ON public.ws0_number_series
FOR EACH ROW EXECUTE FUNCTION public.ws0_audit_foundation_change();

CREATE FUNCTION public.ws0_next_document_number(
  p_company_id uuid, p_branch_id uuid, p_document_type text, p_fiscal_year text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_prefix text;
  v_padding smallint;
  v_number bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws0_feature_enabled('number_series')
     OR NOT public.ws0_scope_allowed(p_company_id,p_branch_id) THEN
    RAISE EXCEPTION 'Number allocation denied: unauthorized scope or feature disabled';
  END IF;
  IF p_document_type IS NULL OR p_document_type !~ '^[A-Z0-9_-]{1,40}$'
     OR p_fiscal_year IS NULL OR p_fiscal_year !~ '^[0-9]{4}[-/][0-9]{2,4}$' THEN
    RAISE EXCEPTION 'Number allocation denied: invalid document type or fiscal year';
  END IF;
  v_prefix := p_document_type || '-';
  v_padding := 6;
  INSERT INTO public.ws0_number_series(company_id,branch_id,document_type,fiscal_year,prefix,padding,next_value)
  VALUES(p_company_id,p_branch_id,p_document_type,p_fiscal_year,v_prefix,v_padding,2)
  ON CONFLICT(company_id,branch_key,document_type,fiscal_year)
  DO UPDATE SET next_value=public.ws0_number_series.next_value+1, updated_at=now()
  RETURNING next_value-1,prefix,padding INTO v_number,v_prefix,v_padding;
  RETURN v_prefix || lpad(v_number::text,v_padding,'0');
END
$function$;
REVOKE ALL ON FUNCTION public.ws0_next_document_number(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ws0_next_document_number(uuid,uuid,text,text) TO authenticated;

COMMIT;
