BEGIN;

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
DECLARE
  new_company UUID;
  source_company UUID;
  group_id UUID;
  new_group_id UUID;
  old_parent UUID;
  new_parent UUID;
  current_date_value DATE := CURRENT_DATE;
  fy_start DATE;
  fy_end DATE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can create companies';
  END IF;

  IF length(trim(_code)) = 0 OR length(trim(_legal_name)) = 0 OR length(trim(_display_name)) = 0 THEN
    RAISE EXCEPTION 'Company code, legal name and display name are required';
  END IF;

  INSERT INTO public.companies(
    code, legal_name, display_name, mailing_name, address, state, gstin, pan,
    base_currency, currency_symbol, created_by
  ) VALUES (
    upper(trim(_code)), trim(_legal_name), trim(_display_name), NULLIF(trim(_mailing_name), ''),
    NULLIF(trim(_address), ''), NULLIF(trim(_state), ''), NULLIF(upper(trim(_gstin)), ''),
    NULLIF(upper(trim(_pan)), ''), upper(trim(_base_currency)), _currency_symbol, auth.uid()
  ) RETURNING id INTO new_company;

  INSERT INTO public.user_company_access(user_id, company_id, is_default)
  VALUES (auth.uid(), new_company, false);

  SELECT id INTO source_company FROM public.companies WHERE code = 'ABOOD' ORDER BY created_at LIMIT 1;

  -- Clone the existing chart structure for the new company without copying balances or party mappings.
  IF source_company IS NOT NULL AND to_regclass('public.ledger_groups') IS NOT NULL THEN
    CREATE TEMP TABLE _company_group_map(old_id UUID PRIMARY KEY, new_id UUID NOT NULL) ON COMMIT DROP;

    FOR group_id, old_parent IN
      SELECT id, parent_id FROM public.ledger_groups
      WHERE company_id = source_company
      ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, name
    LOOP
      new_parent := NULL;
      IF old_parent IS NOT NULL THEN
        SELECT new_id INTO new_parent FROM _company_group_map WHERE old_id = old_parent;
      END IF;

      INSERT INTO public.ledger_groups(name, parent_id, nature, is_system, company_id)
      SELECT lg.name, new_parent, lg.nature, lg.is_system, new_company
      FROM public.ledger_groups lg WHERE lg.id = group_id
      RETURNING id INTO new_group_id;

      INSERT INTO _company_group_map(old_id, new_id) VALUES (group_id, new_group_id);
    END LOOP;

    INSERT INTO public.ledger_accounts(name, group_id, opening_balance, opening_balance_type, is_active, company_id)
    SELECT la.name, gm.new_id, 0, la.opening_balance_type, la.is_active, new_company
    FROM public.ledger_accounts la
    JOIN _company_group_map gm ON gm.old_id = la.group_id
    WHERE la.company_id = source_company
      AND la.is_active = true
      AND la.mapped_party_id IS NULL
      AND la.mapped_supplier_id IS NULL
    ON CONFLICT DO NOTHING;
  END IF;

  -- A fresh fiscal year is created for the new legal entity.
  IF to_regclass('public.financial_years') IS NOT NULL THEN
    IF EXTRACT(MONTH FROM current_date_value) >= 4 THEN
      fy_start := make_date(EXTRACT(YEAR FROM current_date_value)::INT, 4, 1);
    ELSE
      fy_start := make_date((EXTRACT(YEAR FROM current_date_value)::INT) - 1, 4, 1);
    END IF;
    fy_end := (fy_start + INTERVAL '1 year - 1 day')::DATE;

    INSERT INTO public.financial_years(name, start_date, end_date, is_current, is_locked, company_id)
    VALUES (
      EXTRACT(YEAR FROM fy_start)::INT::TEXT || '-' || right((EXTRACT(YEAR FROM fy_start)::INT + 1)::TEXT, 2),
      fy_start, fy_end, true, false, new_company
    );
  END IF;

  -- Copy voucher series definitions but reset each company's sequence to 1.
  IF to_regclass('public.voucher_number_series') IS NOT NULL THEN
    INSERT INTO public.voucher_number_series(voucher_type, prefix, suffix, width, next_number, company_id)
    SELECT voucher_type, prefix, suffix, width, 1, new_company
    FROM public.voucher_number_series
    WHERE company_id = source_company
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN new_company;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

COMMIT;
