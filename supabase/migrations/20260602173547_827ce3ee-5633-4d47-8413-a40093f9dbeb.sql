
-- 1. Add balance + tally_name columns to parties and suppliers
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tally_name text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tally_name text;

CREATE INDEX IF NOT EXISTS idx_parties_tally_name_lower ON public.parties (lower(tally_name));
CREATE INDEX IF NOT EXISTS idx_suppliers_tally_name_lower ON public.suppliers (lower(tally_name));

-- 2. party_ledger_entries
CREATE TABLE IF NOT EXISTS public.party_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  voucher_type text,
  voucher_number text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  narration text,
  source text NOT NULL DEFAULT 'tally',
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ple_party_date ON public.party_ledger_entries (party_id, entry_date);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ple_external_ref
  ON public.party_ledger_entries (party_id, source, external_ref)
  WHERE external_ref IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_ledger_entries TO authenticated;
GRANT ALL ON public.party_ledger_entries TO service_role;

ALTER TABLE public.party_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ple read"
  ON public.party_ledger_entries
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
    OR (
      public.has_role(auth.uid(), 'customer'::app_role)
      AND party_id IN (SELECT id FROM public.parties WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "ple write admin/sales"
  ON public.party_ledger_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'sales'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'sales'::app_role));

-- 3. supplier_ledger_entries
CREATE TABLE IF NOT EXISTS public.supplier_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  voucher_type text,
  voucher_number text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  narration text,
  source text NOT NULL DEFAULT 'tally',
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sle_supplier_date ON public.supplier_ledger_entries (supplier_id, entry_date);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sle_external_ref
  ON public.supplier_ledger_entries (supplier_id, source, external_ref)
  WHERE external_ref IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_ledger_entries TO authenticated;
GRANT ALL ON public.supplier_ledger_entries TO service_role;

ALTER TABLE public.supplier_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sle read"
  ON public.supplier_ledger_entries
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'production'::app_role)
  );

CREATE POLICY "sle write admin/production"
  ON public.supplier_ledger_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'production'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'production'::app_role));
