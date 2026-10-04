-- Multi-company follow-up: remove global uniqueness where Tally-style company books
-- must be independent. Existing values are preserved.
BEGIN;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ledger_groups','cost_centers'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id)', t);
      EXECUTE format('UPDATE public.%I SET company_id = (SELECT id FROM public.companies WHERE code=''ABOOD'') WHERE company_id IS NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(company_id)', 'idx_' || t || '_company_id', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_company_context', t);
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ensure_company_context()', 'trg_' || t || '_company_context', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'company_scope_' || t, t);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = public.current_company_id() AND public.has_company_access(company_id)) WITH CHECK (company_id = public.current_company_id() AND public.has_company_access(company_id))', 'company_scope_' || t, t);
    END IF;
  END LOOP;
END $$;

-- Tally-style numbering: the same voucher series can exist independently in each company.
ALTER TABLE public.voucher_number_series DROP CONSTRAINT IF EXISTS voucher_number_series_voucher_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS voucher_number_series_company_type_unique
  ON public.voucher_number_series(company_id, voucher_type);

ALTER TABLE public.ledger_groups DROP CONSTRAINT IF EXISTS ledger_groups_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_groups_company_name_unique
  ON public.ledger_groups(company_id, name);

ALTER TABLE public.ledger_accounts DROP CONSTRAINT IF EXISTS ledger_accounts_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_company_name_unique
  ON public.ledger_accounts(company_id, name);

ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS vouchers_voucher_type_voucher_number_key;
ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS vouchers_source_table_source_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_company_number_unique
  ON public.vouchers(company_id, voucher_type, voucher_number);
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_company_source_unique
  ON public.vouchers(company_id, source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_order_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_company_number_unique
  ON public.sales_orders(company_id, order_number);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_number_unique
  ON public.invoices(company_id, invoice_number);

ALTER TABLE public.production_orders DROP CONSTRAINT IF EXISTS production_orders_production_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS production_orders_company_number_unique
  ON public.production_orders(company_id, production_number);

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_employee_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS employees_company_code_unique
  ON public.employees(company_id, employee_code);

-- Financial years are independent books: one current year per company, not globally.
DROP INDEX IF EXISTS public.financial_years_one_current_unique;
CREATE UNIQUE INDEX IF NOT EXISTS financial_years_company_one_current_unique
  ON public.financial_years(company_id, is_current) WHERE is_current;

COMMIT;
