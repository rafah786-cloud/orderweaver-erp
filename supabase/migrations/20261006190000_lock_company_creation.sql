BEGIN;

-- Mattress Maestro has four approved books. Existing companies remain editable,
-- but arbitrary fifth-company creation is disabled at the database boundary.
CREATE OR REPLACE FUNCTION public.create_company(
  _code TEXT,
  _legal_name TEXT,
  _display_name TEXT,
  _mailing_name TEXT DEFAULT NULL,
  _address TEXT DEFAULT NULL,
  _state TEXT DEFAULT NULL,
  _gstin TEXT DEFAULT NULL,
  _pan TEXT DEFAULT NULL,
  _base_currency TEXT DEFAULT 'INR',
  _currency_symbol TEXT DEFAULT '₹'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can create companies';
  END IF;

  RAISE EXCEPTION
    'Creation of new companies is disabled. Mattress Maestro is locked to the four approved books.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT
) TO authenticated;

COMMIT;
