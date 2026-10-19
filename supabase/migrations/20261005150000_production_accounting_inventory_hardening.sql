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
