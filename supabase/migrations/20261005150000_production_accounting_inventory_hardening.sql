-- Mattress Maestro production hardening / schema alignment.
-- Additive only: no business rows are rewritten or deleted.
-- This migration aligns the live database with the current repository invoice/order UI
-- and removes direct table-write paths for canonical accounting/inventory ledgers.

ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'draft';

ALTER TABLE public.purchase_bills
  DROP CONSTRAINT IF EXISTS purchase_bills_receipt_status_check;

ALTER TABLE public.purchase_bills
  ADD CONSTRAINT purchase_bills_receipt_status_check
  CHECK (receipt_status IN ('draft', 'received', 'cancelled'));

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'draft';

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_fulfillment_status_check;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_fulfillment_status_check
  CHECK (fulfillment_status IN ('draft', 'confirmed', 'dispatched', 'cancelled'));

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cgst_amount numeric,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric,
  ADD COLUMN IF NOT EXISTS igst_amount numeric;

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS vouchers_idempotency_key_unique
  ON public.vouchers (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stock_items_one_raw_material
  ON public.stock_items (mapped_raw_material_id)
  WHERE mapped_raw_material_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stock_items_one_model
  ON public.stock_items (mapped_model_id)
  WHERE mapped_model_id IS NOT NULL;

-- The billwise accounting schema was previously kept only under the isolated
-- accounting-phase2 track. Later authoritative migrations depend on these tables,
-- so establish their additive foundation here before bill allocations.
DO $ws0$
BEGIN
  CREATE TYPE public.bill_party_kind AS ENUM ('customer','supplier');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$ws0$;
DO $ws0$
BEGIN
  CREATE TYPE public.bill_reference_type AS ENUM ('opening','new_ref','on_account','advance');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$ws0$;
DO $ws0$
BEGIN
  CREATE TYPE public.bill_status AS ENUM ('open','partial','settled','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$ws0$;

CREATE TABLE IF NOT EXISTS public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  party_kind public.bill_party_kind NOT NULL,
  party_id uuid REFERENCES public.parties(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ledger_account_id uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  bill_reference text NOT NULL,
  bill_date date NOT NULL,
  due_date date,
  reference_type public.bill_reference_type NOT NULL DEFAULT 'new_ref',
  original_amount numeric(18,2) NOT NULL CHECK (original_amount > 0),
  currency_code text NOT NULL DEFAULT 'INR',
  source_voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  source_voucher_entry_id uuid NOT NULL REFERENCES public.voucher_entries(id) ON DELETE RESTRICT,
  status public.bill_status NOT NULL DEFAULT 'open',
  cancelled_on date,
  source_voiding_voucher_id uuid REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  external_ref text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bills_party_kind_identity_check CHECK (
    (party_kind='customer' AND party_id IS NOT NULL AND supplier_id IS NULL) OR
    (party_kind='supplier' AND supplier_id IS NOT NULL AND party_id IS NULL)
  ),
  CONSTRAINT bills_due_date_order CHECK (due_date IS NULL OR due_date >= bill_date),
  CONSTRAINT bills_source_voucher_entry_unique UNIQUE (source_voucher_entry_id)
);

DROP TRIGGER IF EXISTS trg_bills_company_context ON public.bills;
CREATE TRIGGER trg_bills_company_context
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.ensure_company_context();
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_scope_bills ON public.bills;
CREATE POLICY company_scope_bills ON public.bills
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.has_company_access(company_id));
DROP POLICY IF EXISTS "bills staff read" ON public.bills;
CREATE POLICY "bills staff read" ON public.bills FOR SELECT TO authenticated USING (
  company_id = public.current_company_id()
  AND public.has_company_access(company_id)
  AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')
    OR (party_kind='customer' AND public.has_role(auth.uid(),'sales'))
    OR (party_kind='customer' AND public.has_role(auth.uid(),'customer')
        AND party_id IN (SELECT id FROM public.parties WHERE user_id=auth.uid()))
    OR (party_kind='supplier' AND public.has_role(auth.uid(),'production'))
    OR (party_kind='supplier' AND public.has_role(auth.uid(),'vendor')
        AND supplier_id IN (SELECT id FROM public.suppliers WHERE user_id=auth.uid()))
  )
);
-- Canonical bill mutations must go through the posting/settlement RPCs, not direct table DML.
REVOKE ALL ON TABLE public.bills FROM anon, authenticated;
GRANT SELECT ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;
CREATE INDEX IF NOT EXISTS bills_party_status_due_idx
  ON public.bills(party_kind,party_id,supplier_id,status,due_date);
CREATE INDEX IF NOT EXISTS bills_ledger_date_idx ON public.bills(ledger_account_id,bill_date);

-- The billwise accounting schema was previously kept only under the isolated
-- accounting-phase2/ track, which is not part of the authoritative Supabase CLI
-- migration chain. Later authoritative migrations already depend on this table.
-- Define the required table here so a clean CLI replay has the same dependency.
DO $ws0$
BEGIN
  CREATE TYPE public.bill_allocation_type AS ENUM ('against_ref','new_ref','on_account','advance');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$ws0$;

CREATE TABLE IF NOT EXISTS public.bill_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  settlement_voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  settlement_voucher_entry_id uuid NOT NULL REFERENCES public.voucher_entries(id) ON DELETE RESTRICT,
  allocation_type public.bill_allocation_type NOT NULL DEFAULT 'against_ref',
  allocation_date date NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  effect smallint NOT NULL DEFAULT 1 CHECK (effect IN (-1,1)),
  currency_code text NOT NULL DEFAULT 'INR',
  reverses_allocation_id uuid REFERENCES public.bill_allocations(id) ON DELETE RESTRICT,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- This table is created after the company-foundation migration, so install its
-- company-context trigger and restrictive tenant policy here as well.
DROP TRIGGER IF EXISTS trg_bill_allocations_company_context ON public.bill_allocations;
CREATE TRIGGER trg_bill_allocations_company_context
  BEFORE INSERT OR UPDATE ON public.bill_allocations
  FOR EACH ROW EXECUTE FUNCTION public.ensure_company_context();

ALTER TABLE public.bill_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_scope_bill_allocations ON public.bill_allocations;
CREATE POLICY company_scope_bill_allocations ON public.bill_allocations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.has_company_access(company_id));
DROP POLICY IF EXISTS bill_allocations_read ON public.bill_allocations;
CREATE POLICY bill_allocations_read ON public.bill_allocations FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.id = bill_allocations.bill_id
        AND (
          public.has_role(auth.uid(),'admin')
          OR public.has_role(auth.uid(),'accountant')
          OR (b.party_kind='customer' AND public.has_role(auth.uid(),'sales'))
          OR (b.party_kind='customer' AND public.has_role(auth.uid(),'customer')
              AND b.party_id IN (SELECT id FROM public.parties WHERE user_id=auth.uid()))
          OR (b.party_kind='supplier' AND public.has_role(auth.uid(),'production'))
          OR (b.party_kind='supplier' AND public.has_role(auth.uid(),'vendor')
              AND b.supplier_id IN (SELECT id FROM public.suppliers WHERE user_id=auth.uid()))
        )
    )
  );

-- Allocation rows are financial evidence; clients may read through RLS but cannot mutate them directly.
REVOKE ALL ON TABLE public.bill_allocations FROM anon, authenticated;
GRANT SELECT ON public.bill_allocations TO authenticated;
GRANT ALL ON public.bill_allocations TO service_role;

CREATE INDEX IF NOT EXISTS bill_allocations_bill_date_idx
  ON public.bill_allocations (bill_id, allocation_date);
CREATE INDEX IF NOT EXISTS bill_allocations_voucher_idx
  ON public.bill_allocations (settlement_voucher_id);

CREATE UNIQUE INDEX IF NOT EXISTS bill_allocations_idempotency_key_unique
  ON public.bill_allocations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The canonical posting path uses SECURITY DEFINER functions.
-- Application roles may read through RLS but cannot bypass posting controls with direct DML.
REVOKE ALL ON TABLE public.vouchers FROM anon, authenticated;
REVOKE ALL ON TABLE public.voucher_entries FROM anon, authenticated;
REVOKE ALL ON TABLE public.voucher_number_series FROM anon, authenticated;
REVOKE ALL ON TABLE public.stock_movements FROM anon, authenticated;

GRANT SELECT ON TABLE public.vouchers TO authenticated;
GRANT SELECT ON TABLE public.voucher_entries TO authenticated;
GRANT SELECT ON TABLE public.voucher_number_series TO authenticated;
GRANT SELECT ON TABLE public.stock_movements TO authenticated;
