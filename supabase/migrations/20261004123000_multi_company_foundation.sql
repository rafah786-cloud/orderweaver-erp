-- Mattress Maestro multi-company foundation
-- Tally-style model: each legal entity has separate books, masters and transactions.
-- Existing records are assigned to the first seeded company. No existing values are rewritten.

BEGIN;

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  mailing_name TEXT,
  address TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'India',
  gstin TEXT,
  pan TEXT,
  base_currency TEXT NOT NULL DEFAULT 'INR',
  currency_symbol TEXT NOT NULL DEFAULT '₹',
  financial_year_start_month SMALLINT NOT NULL DEFAULT 4 CHECK (financial_year_start_month BETWEEN 1 AND 12),
  financial_year_start_day SMALLINT NOT NULL DEFAULT 1 CHECK (financial_year_start_day BETWEEN 1 AND 31),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_one_default_idx
  ON public.companies(is_default) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.user_company_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT true,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_company_one_default_idx
  ON public.user_company_access(user_id) WHERE is_default;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Seed the two existing legal entities. Details can be completed from Settings.
INSERT INTO public.companies (code, legal_name, display_name, mailing_name, is_default)
VALUES
  ('ABOOD', 'Abood Tradings', 'Abood Tradings', 'Abood Tradings', true),
  ('ZIZZ', 'Zizz Smart Sleep Technologies LLP', 'Zizz Smart Sleep Technologies LLP', 'Zizz Smart Sleep Technologies LLP', false)
ON CONFLICT (code) DO NOTHING;

-- Business tables are company-owned. Shared reference tables such as currencies remain global.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'parties','suppliers','ledger_accounts','financial_years','financial_year_events',
    'vouchers','voucher_entries','voucher_number_series','invoices','invoice_items',
    'purchase_bills','purchase_bill_items','sales_orders','sales_order_items',
    'production_orders','raw_materials','stock_items','stock_movements','stock_postings',
    'model_boq','product_models','bills','bill_allocations','invoice_tax_snapshots',
    'accounting_opening_snapshot','tally_source_balances','tally_import_staging',
    'bank_accounts','payments','receipts','journal_entries','journal_entry_lines',
    'employees','attendance','payroll_runs','payroll_entries','expense_claims',
    'godowns','warehouses','stock_reservations','purchase_orders','purchase_order_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id)', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(company_id)', 'idx_' || t || '_company_id', t);
    END IF;
  END LOOP;
END $$;

-- Existing production records belong to the current/default company.
DO $$
DECLARE
  default_company UUID;
  t TEXT;
  tables TEXT[] := ARRAY[
    'parties','suppliers','ledger_accounts','financial_years','financial_year_events',
    'vouchers','voucher_entries','voucher_number_series','invoices','invoice_items',
    'purchase_bills','purchase_bill_items','sales_orders','sales_order_items',
    'production_orders','raw_materials','stock_items','stock_movements','stock_postings',
    'model_boq','product_models','bills','bill_allocations','invoice_tax_snapshots',
    'accounting_opening_snapshot','tally_source_balances','tally_import_staging',
    'bank_accounts','payments','receipts','journal_entries','journal_entry_lines',
    'employees','attendance','payroll_runs','payroll_entries','expense_claims',
    'godowns','warehouses','stock_reservations','purchase_orders','purchase_order_items'
  ];
BEGIN
  SELECT id INTO default_company FROM public.companies WHERE code = 'ABOOD';
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='company_id') THEN
      EXECUTE format('UPDATE public.%I SET company_id = $1 WHERE company_id IS NULL', t) USING default_company;
    END IF;
  END LOOP;

  UPDATE public.profiles
  SET active_company_id = default_company
  WHERE active_company_id IS NULL;

  INSERT INTO public.user_company_access(user_id, company_id, is_default)
  SELECT p.id, default_company, true
  FROM public.profiles p
  ON CONFLICT (user_id, company_id) DO NOTHING;
END $$;

-- Current company for the signed-in user.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT active_company_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_company_access(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_access
    WHERE user_id = auth.uid()
      AND company_id = _company_id
      AND can_view = true
  )
$$;

CREATE OR REPLACE FUNCTION public.set_active_company(_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_company_access
    WHERE user_id = auth.uid() AND company_id = _company_id AND can_view = true
  ) THEN
    RAISE EXCEPTION 'You do not have access to this company';
  END IF;

  UPDATE public.profiles
  SET active_company_id = _company_id, updated_at = now()
  WHERE id = auth.uid();

  RETURN _company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_company_context()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE active_id UUID;
BEGIN
  active_id := public.current_company_id();

  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NULL THEN
      IF active_id IS NULL THEN
        RAISE EXCEPTION 'No active company selected';
      END IF;
      NEW.company_id := active_id;
    ELSIF active_id IS NOT NULL AND NEW.company_id <> active_id AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Record company does not match active company';
    END IF;
  ELSE
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Company cannot be changed after a record is created';
    END IF;
    IF active_id IS NOT NULL AND OLD.company_id <> active_id AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Record belongs to another company';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply a trigger to every company-owned table. Existing application inserts automatically inherit the active company.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'parties','suppliers','ledger_accounts','financial_years','financial_year_events',
    'vouchers','voucher_entries','voucher_number_series','invoices','invoice_items',
    'purchase_bills','purchase_bill_items','sales_orders','sales_order_items',
    'production_orders','raw_materials','stock_items','stock_movements','stock_postings',
    'model_boq','product_models','bills','bill_allocations','invoice_tax_snapshots',
    'accounting_opening_snapshot','tally_source_balances','tally_import_staging',
    'bank_accounts','payments','receipts','journal_entries','journal_entry_lines',
    'employees','attendance','payroll_runs','payroll_entries','expense_claims',
    'godowns','warehouses','stock_reservations','purchase_orders','purchase_order_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_company_context', t);
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ensure_company_context()', 'trg_' || t || '_company_context', t);
    END IF;
  END LOOP;
END $$;

-- Restrictive RLS policy: existing role/ownership policies still apply, but never outside the active company.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'parties','suppliers','ledger_accounts','financial_years','financial_year_events',
    'vouchers','voucher_entries','voucher_number_series','invoices','invoice_items',
    'purchase_bills','purchase_bill_items','sales_orders','sales_order_items',
    'production_orders','raw_materials','stock_items','stock_movements','stock_postings',
    'model_boq','product_models','bills','bill_allocations','invoice_tax_snapshots',
    'accounting_opening_snapshot','tally_source_balances','tally_import_staging',
    'bank_accounts','payments','receipts','journal_entries','journal_entry_lines',
    'employees','attendance','payroll_runs','payroll_entries','expense_claims',
    'godowns','warehouses','stock_reservations','purchase_orders','purchase_order_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'company_scope_' || t, t);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = public.current_company_id() AND public.has_company_access(company_id)) WITH CHECK (company_id = public.current_company_id() AND public.has_company_access(company_id))', 'company_scope_' || t, t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_company_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies visible to members" ON public.companies
  FOR SELECT TO authenticated
  USING (public.has_company_access(id));
CREATE POLICY "admins manage companies" ON public.companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "members see own company access" ON public.user_company_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage company access" ON public.user_company_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.companies TO authenticated;
GRANT SELECT ON public.user_company_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_company(UUID) TO authenticated;

COMMIT;
