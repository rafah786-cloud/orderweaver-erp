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
