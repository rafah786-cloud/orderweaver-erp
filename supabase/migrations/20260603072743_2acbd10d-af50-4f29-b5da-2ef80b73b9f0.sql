
-- ============================================================
-- 1. LEDGER GROUPS
-- ============================================================
CREATE TYPE public.ledger_nature AS ENUM ('assets','liabilities','income','expenses');

CREATE TABLE public.ledger_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  parent_id uuid REFERENCES public.ledger_groups(id) ON DELETE RESTRICT,
  nature public.ledger_nature NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  affects_gross_profit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_groups TO authenticated;
GRANT ALL ON public.ledger_groups TO service_role;
ALTER TABLE public.ledger_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lg read" ON public.ledger_groups FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "lg write" ON public.ledger_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));

CREATE TRIGGER lg_touch BEFORE UPDATE ON public.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed primary groups
INSERT INTO public.ledger_groups (name, parent_id, nature, is_system) VALUES
  ('Capital Account', NULL, 'liabilities', true),
  ('Loans (Liability)', NULL, 'liabilities', true),
  ('Current Liabilities', NULL, 'liabilities', true),
  ('Fixed Assets', NULL, 'assets', true),
  ('Investments', NULL, 'assets', true),
  ('Current Assets', NULL, 'assets', true),
  ('Branch / Divisions', NULL, 'assets', true),
  ('Misc. Expenses (Asset)', NULL, 'assets', true),
  ('Suspense Account', NULL, 'assets', true),
  ('Sales Accounts', NULL, 'income', true),
  ('Purchase Accounts', NULL, 'expenses', true),
  ('Direct Incomes', NULL, 'income', true),
  ('Indirect Incomes', NULL, 'income', true),
  ('Direct Expenses', NULL, 'expenses', true),
  ('Indirect Expenses', NULL, 'expenses', true);

-- Sub-groups
INSERT INTO public.ledger_groups (name, parent_id, nature, is_system)
SELECT s.name, p.id, s.nature::public.ledger_nature, true
FROM (VALUES
  ('Reserves & Surplus', 'Capital Account', 'liabilities'),
  ('Bank OD A/c', 'Loans (Liability)', 'liabilities'),
  ('Secured Loans', 'Loans (Liability)', 'liabilities'),
  ('Unsecured Loans', 'Loans (Liability)', 'liabilities'),
  ('Duties & Taxes', 'Current Liabilities', 'liabilities'),
  ('Provisions', 'Current Liabilities', 'liabilities'),
  ('Sundry Creditors', 'Current Liabilities', 'liabilities'),
  ('Bank Accounts', 'Current Assets', 'assets'),
  ('Cash-in-hand', 'Current Assets', 'assets'),
  ('Deposits (Asset)', 'Current Assets', 'assets'),
  ('Loans & Advances (Asset)', 'Current Assets', 'assets'),
  ('Stock-in-hand', 'Current Assets', 'assets'),
  ('Sundry Debtors', 'Current Assets', 'assets')
) AS s(name, parent_name, nature)
JOIN public.ledger_groups p ON p.name = s.parent_name;

-- ============================================================
-- 2. LEDGER ACCOUNTS
-- ============================================================
CREATE TABLE public.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  group_id uuid NOT NULL REFERENCES public.ledger_groups(id) ON DELETE RESTRICT,
  opening_balance numeric NOT NULL DEFAULT 0,
  opening_balance_type text NOT NULL DEFAULT 'dr' CHECK (opening_balance_type IN ('dr','cr')),
  is_system boolean NOT NULL DEFAULT false,
  mapped_party_id uuid,
  mapped_supplier_id uuid,
  mapped_bank_account_id uuid,
  gstin text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_la_group ON public.ledger_accounts(group_id);
CREATE INDEX idx_la_party ON public.ledger_accounts(mapped_party_id);
CREATE INDEX idx_la_supplier ON public.ledger_accounts(mapped_supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_accounts TO authenticated;
GRANT ALL ON public.ledger_accounts TO service_role;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "la read" ON public.ledger_accounts FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role)
         OR has_role(auth.uid(),'sales'::public.app_role) OR has_role(auth.uid(),'production'::public.app_role));
CREATE POLICY "la write" ON public.ledger_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));

CREATE TRIGGER la_touch BEFORE UPDATE ON public.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.ledger_accounts (name, group_id, is_system)
SELECT s.name, g.id, true FROM (VALUES
  ('Cash', 'Cash-in-hand'),
  ('Sales', 'Sales Accounts'),
  ('Purchases', 'Purchase Accounts'),
  ('Output CGST', 'Duties & Taxes'),
  ('Output SGST', 'Duties & Taxes'),
  ('Output IGST', 'Duties & Taxes'),
  ('Input CGST', 'Duties & Taxes'),
  ('Input SGST', 'Duties & Taxes'),
  ('Input IGST', 'Duties & Taxes'),
  ('Salary & Wages', 'Indirect Expenses'),
  ('PF Payable', 'Current Liabilities'),
  ('ESI Payable', 'Current Liabilities'),
  ('Opening Balance Equity', 'Capital Account'),
  ('Round Off', 'Indirect Expenses')
) AS s(name, group_name)
JOIN public.ledger_groups g ON g.name = s.group_name;

-- ============================================================
-- 3. COST CENTERS
-- ============================================================
CREATE TABLE public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  parent_id uuid REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc read" ON public.cost_centers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "cc write" ON public.cost_centers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));
CREATE TRIGGER cc_touch BEFORE UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 4. FINANCIAL YEARS
-- ============================================================
CREATE TABLE public.financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_years TO authenticated;
GRANT ALL ON public.financial_years TO service_role;
ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fy read" ON public.financial_years FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "fy write" ON public.financial_years FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER fy_touch BEFORE UPDATE ON public.financial_years FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.financial_years (name, start_date, end_date, is_current) VALUES
  ('2025-26', '2025-04-01', '2026-03-31', true),
  ('2026-27', '2026-04-01', '2027-03-31', false);

-- ============================================================
-- 5. VOUCHER NUMBER SERIES + VOUCHER TYPE
-- ============================================================
CREATE TYPE public.voucher_type AS ENUM
  ('sales','purchase','receipt','payment','contra','journal','debit_note','credit_note','stock_journal');

CREATE TABLE public.voucher_number_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_type public.voucher_type NOT NULL UNIQUE,
  prefix text NOT NULL DEFAULT '',
  suffix text NOT NULL DEFAULT '',
  next_number integer NOT NULL DEFAULT 1,
  width integer NOT NULL DEFAULT 4,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_number_series TO authenticated;
GRANT ALL ON public.voucher_number_series TO service_role;
ALTER TABLE public.voucher_number_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vns read" ON public.voucher_number_series FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "vns write" ON public.voucher_number_series FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));

INSERT INTO public.voucher_number_series (voucher_type, prefix) VALUES
  ('sales','SAL/'),('purchase','PUR/'),('receipt','RCP/'),('payment','PAY/'),
  ('contra','CON/'),('journal','JV/'),('debit_note','DN/'),('credit_note','CN/'),
  ('stock_journal','STK/');

-- ============================================================
-- 6. VOUCHERS
-- ============================================================
CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number text NOT NULL,
  voucher_type public.voucher_type NOT NULL,
  voucher_date date NOT NULL DEFAULT CURRENT_DATE,
  narration text,
  reference text,
  source_table text,
  source_id uuid,
  is_locked boolean NOT NULL DEFAULT false,
  financial_year_id uuid REFERENCES public.financial_years(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(voucher_type, voucher_number),
  UNIQUE(source_table, source_id)
);

CREATE INDEX idx_v_date ON public.vouchers(voucher_date);
CREATE INDEX idx_v_type ON public.vouchers(voucher_type);
CREATE INDEX idx_v_source ON public.vouchers(source_table, source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v read" ON public.vouchers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "v write" ON public.vouchers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));
CREATE TRIGGER v_touch BEFORE UPDATE ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 7. VOUCHER ENTRIES
-- ============================================================
CREATE TABLE public.voucher_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  ledger_account_id uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  narration text,
  line_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE INDEX idx_ve_voucher ON public.voucher_entries(voucher_id);
CREATE INDEX idx_ve_ledger ON public.voucher_entries(ledger_account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_entries TO authenticated;
GRANT ALL ON public.voucher_entries TO service_role;
ALTER TABLE public.voucher_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ve access" ON public.voucher_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vouchers v WHERE v.id = voucher_entries.voucher_id
                 AND (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role))))
  WITH CHECK (has_role(auth.uid(),'admin'::public.app_role) OR has_role(auth.uid(),'accountant'::public.app_role));

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_voucher_number(_type public.voucher_type)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.voucher_number_series%ROWTYPE; num text;
BEGIN
  SELECT * INTO s FROM public.voucher_number_series WHERE voucher_type = _type FOR UPDATE;
  num := s.prefix || lpad(s.next_number::text, s.width, '0') || s.suffix;
  UPDATE public.voucher_number_series SET next_number = next_number + 1, updated_at = now()
    WHERE voucher_type = _type;
  RETURN num;
END $$;

CREATE OR REPLACE FUNCTION public.check_voucher_balanced(_voucher_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total_dr numeric; total_cr numeric;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO total_dr, total_cr
  FROM public.voucher_entries WHERE voucher_id = _voucher_id;
  IF ABS(total_dr - total_cr) > 0.01 THEN
    RAISE EXCEPTION 'Voucher % is not balanced: Dr=% Cr=%', _voucher_id, total_dr, total_cr;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_or_create_party_ledger(_party_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lid uuid; pname text; gid uuid;
BEGIN
  SELECT id INTO lid FROM public.ledger_accounts WHERE mapped_party_id = _party_id LIMIT 1;
  IF lid IS NOT NULL THEN RETURN lid; END IF;
  SELECT name INTO pname FROM public.parties WHERE id = _party_id;
  SELECT id INTO gid FROM public.ledger_groups WHERE name = 'Sundry Debtors';
  INSERT INTO public.ledger_accounts (name, group_id, mapped_party_id)
    VALUES (COALESCE(pname,'Party') || ' [' || substring(_party_id::text,1,8) || ']', gid, _party_id)
    RETURNING id INTO lid;
  RETURN lid;
END $$;

CREATE OR REPLACE FUNCTION public.get_or_create_supplier_ledger(_supplier_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lid uuid; sname text; gid uuid;
BEGIN
  SELECT id INTO lid FROM public.ledger_accounts WHERE mapped_supplier_id = _supplier_id LIMIT 1;
  IF lid IS NOT NULL THEN RETURN lid; END IF;
  SELECT name INTO sname FROM public.suppliers WHERE id = _supplier_id;
  SELECT id INTO gid FROM public.ledger_groups WHERE name = 'Sundry Creditors';
  INSERT INTO public.ledger_accounts (name, group_id, mapped_supplier_id)
    VALUES (COALESCE(sname,'Supplier') || ' [' || substring(_supplier_id::text,1,8) || ']', gid, _supplier_id)
    RETURNING id INTO lid;
  RETURN lid;
END $$;

-- ============================================================
-- 9. AUTO-POST INVOICES
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_invoice_to_voucher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_num text;
  party_ledger uuid; sales_ledger uuid;
  cgst_ledger uuid; sgst_ledger uuid; igst_ledger uuid;
  is_interstate boolean; half_tax numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.vouchers WHERE source_table='invoices' AND source_id=NEW.id) THEN
    RETURN NEW;
  END IF;
  v_num := public.next_voucher_number('sales');
  party_ledger := public.get_or_create_party_ledger(NEW.party_id);
  SELECT id INTO sales_ledger FROM public.ledger_accounts WHERE name='Sales' LIMIT 1;
  SELECT id INTO cgst_ledger FROM public.ledger_accounts WHERE name='Output CGST' LIMIT 1;
  SELECT id INTO sgst_ledger FROM public.ledger_accounts WHERE name='Output SGST' LIMIT 1;
  SELECT id INTO igst_ledger FROM public.ledger_accounts WHERE name='Output IGST' LIMIT 1;

  is_interstate := (NEW.dispatch_state_code IS NOT NULL AND NEW.supplier_gstin IS NOT NULL
                    AND NEW.dispatch_state_code <> substring(NEW.supplier_gstin,1,2));

  INSERT INTO public.vouchers (voucher_number, voucher_type, voucher_date, narration, reference, source_table, source_id)
    VALUES (v_num, 'sales', NEW.invoice_date, 'Auto: Invoice ' || NEW.invoice_number, NEW.invoice_number, 'invoices', NEW.id)
    RETURNING id INTO v_id;

  INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, debit, line_order)
    VALUES (v_id, party_ledger, NEW.total_amount, 1);
  INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, credit, line_order)
    VALUES (v_id, sales_ledger, NEW.subtotal, 2);
  IF NEW.tax_amount > 0 THEN
    IF is_interstate THEN
      INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, credit, line_order)
        VALUES (v_id, igst_ledger, NEW.tax_amount, 3);
    ELSE
      half_tax := NEW.tax_amount / 2;
      INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, credit, line_order)
        VALUES (v_id, cgst_ledger, half_tax, 3);
      INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, credit, line_order)
        VALUES (v_id, sgst_ledger, NEW.tax_amount - half_tax, 4);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_invoice_to_voucher AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.post_invoice_to_voucher();

-- ============================================================
-- 10. AUTO-POST PURCHASE BILLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_purchase_to_voucher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_num text; sup_ledger uuid; purchase_ledger uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.vouchers WHERE source_table='purchase_bills' AND source_id=NEW.id) THEN
    RETURN NEW;
  END IF;
  IF NEW.supplier_id IS NULL THEN RETURN NEW; END IF;
  v_num := public.next_voucher_number('purchase');
  sup_ledger := public.get_or_create_supplier_ledger(NEW.supplier_id);
  SELECT id INTO purchase_ledger FROM public.ledger_accounts WHERE name='Purchases' LIMIT 1;
  INSERT INTO public.vouchers (voucher_number, voucher_type, voucher_date, narration, reference, source_table, source_id)
    VALUES (v_num, 'purchase', NEW.bill_date, 'Auto: Bill ' || NEW.bill_number, NEW.bill_number, 'purchase_bills', NEW.id)
    RETURNING id INTO v_id;
  INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, debit, line_order)
    VALUES (v_id, purchase_ledger, NEW.total_amount, 1);
  INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, credit, line_order)
    VALUES (v_id, sup_ledger, NEW.total_amount, 2);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_purchase_to_voucher AFTER INSERT ON public.purchase_bills
  FOR EACH ROW EXECUTE FUNCTION public.post_purchase_to_voucher();

-- ============================================================
-- 11. LEDGER BALANCES VIEW
-- ============================================================
CREATE OR REPLACE VIEW public.ledger_balances
WITH (security_invoker = true) AS
SELECT
  la.id AS ledger_id,
  la.name,
  la.group_id,
  lg.name AS group_name,
  lg.nature,
  la.opening_balance,
  la.opening_balance_type,
  COALESCE(SUM(ve.debit), 0) AS total_debit,
  COALESCE(SUM(ve.credit), 0) AS total_credit,
  (CASE WHEN la.opening_balance_type='dr' THEN la.opening_balance ELSE -la.opening_balance END)
    + COALESCE(SUM(ve.debit),0) - COALESCE(SUM(ve.credit),0) AS closing_balance
FROM public.ledger_accounts la
JOIN public.ledger_groups lg ON lg.id = la.group_id
LEFT JOIN public.voucher_entries ve ON ve.ledger_account_id = la.id
GROUP BY la.id, la.name, la.group_id, lg.name, lg.nature, la.opening_balance, la.opening_balance_type;

GRANT SELECT ON public.ledger_balances TO authenticated;
