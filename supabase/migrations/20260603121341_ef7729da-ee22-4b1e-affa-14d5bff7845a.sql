-- Phase 4: Banking

-- Currencies
CREATE TABLE public.currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text,
  is_base boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cur read" ON public.currencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "cur write" ON public.currencies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

INSERT INTO public.currencies (code,name,symbol,is_base) VALUES
  ('INR','Indian Rupee','₹',true),
  ('USD','US Dollar','$',false),
  ('EUR','Euro','€',false),
  ('GBP','British Pound','£',false),
  ('AED','UAE Dirham','د.إ',false)
ON CONFLICT DO NOTHING;

-- Exchange rates
CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL REFERENCES public.currencies(code),
  rate_date date NOT NULL,
  rate numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(currency_code, rate_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "er read" ON public.exchange_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "er write" ON public.exchange_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

-- Bank accounts
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  ifsc_code text,
  branch text,
  account_type text NOT NULL DEFAULT 'current',
  currency_code text NOT NULL DEFAULT 'INR' REFERENCES public.currencies(code),
  opening_balance numeric NOT NULL DEFAULT 0,
  opening_balance_date date NOT NULL DEFAULT CURRENT_DATE,
  ledger_account_id uuid REFERENCES public.ledger_accounts(id),
  cheque_print_template jsonb,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba read" ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "ba write" ON public.bank_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

CREATE TRIGGER tg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bank transactions (book side + statement side)
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  txn_date date NOT NULL,
  value_date date,
  description text,
  reference text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  balance numeric,
  source text NOT NULL DEFAULT 'book', -- 'book' | 'statement'
  voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  reconciled_at timestamptz,
  reconciled_with uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  bank_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bt_account_date ON public.bank_transactions(bank_account_id, txn_date);
CREATE INDEX idx_bt_unreconciled ON public.bank_transactions(bank_account_id, source) WHERE reconciled_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bt read" ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "bt write" ON public.bank_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

-- Cheques (issued + received)
CREATE TABLE public.cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL, -- 'issued' | 'received'
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  cheque_number text NOT NULL,
  cheque_date date NOT NULL,
  amount numeric NOT NULL,
  party_name text NOT NULL,
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  bank_name text,
  branch text,
  status text NOT NULL DEFAULT 'pending', -- pending | cleared | bounced | cancelled
  cleared_date date,
  voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  purchase_bill_id uuid REFERENCES public.purchase_bills(id) ON DELETE SET NULL,
  narration text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cheques_status ON public.cheques(status, cheque_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheques TO authenticated;
GRANT ALL ON public.cheques TO service_role;
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ch read" ON public.cheques FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "ch write" ON public.cheques FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

CREATE TRIGGER tg_cheques_updated BEFORE UPDATE ON public.cheques
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add currency to vouchers (multi-currency support)
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1;

-- Trigger: when a payment/receipt voucher posts to a bank ledger, mirror into bank_transactions
CREATE OR REPLACE FUNCTION public.post_voucher_to_bank_txn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.vouchers%ROWTYPE; ba record;
BEGIN
  SELECT * INTO v FROM public.vouchers WHERE id = NEW.voucher_id;
  IF v.voucher_type NOT IN ('payment','receipt','contra') THEN RETURN NEW; END IF;
  SELECT b.id, b.* INTO ba FROM public.bank_accounts b WHERE b.ledger_account_id = NEW.ledger_account_id LIMIT 1;
  IF ba.id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.bank_transactions WHERE voucher_id = v.id AND bank_account_id = ba.id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.bank_transactions (bank_account_id, txn_date, description, reference, debit, credit, source, voucher_id)
  VALUES (ba.id, v.voucher_date, COALESCE(v.narration, v.voucher_type::text), v.voucher_number,
          NEW.credit, NEW.debit, 'book', v.id);
  RETURN NEW;
END $$;

CREATE TRIGGER tg_voucher_entry_bank_txn
AFTER INSERT ON public.voucher_entries
FOR EACH ROW EXECUTE FUNCTION public.post_voucher_to_bank_txn();
