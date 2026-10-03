-- NOT INSTALLED. Adds operational status only. Does not update existing rows beyond the default
-- and does not write stock or accounting.

ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'draft'
  CHECK (receipt_status IN ('draft', 'received', 'cancelled'));

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'draft'
  CHECK (fulfillment_status IN ('draft', 'confirmed', 'dispatched', 'cancelled'));
