-- Extend parties for EWB needs (gstin already exists)
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS pin_code text,
  ADD COLUMN IF NOT EXISTS state_code text;

-- Extend invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS supplier_gstin text,
  ADD COLUMN IF NOT EXISTS dispatch_pincode text,
  ADD COLUMN IF NOT EXISTS dispatch_state_code text;

-- Extend invoice items with HSN
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 18;

-- E-way bills table
CREATE TABLE IF NOT EXISTS public.e_way_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  ewb_number text,
  ewb_date timestamptz,
  valid_upto timestamptz,
  status text NOT NULL DEFAULT 'pending', -- pending | generated | cancelled | failed
  transport_mode text,             -- 1=Road, 2=Rail, 3=Air, 4=Ship
  sub_supply_type text,            -- 1=Supply, 2=Import, etc.
  document_type text DEFAULT 'INV',
  transporter_id text,
  transporter_name text,
  vehicle_number text,
  distance_km integer,
  transaction_type text DEFAULT 'Regular',
  generated_by uuid,
  error_message text,
  request_payload jsonb,
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_e_way_bills_invoice_id ON public.e_way_bills(invoice_id);
CREATE INDEX IF NOT EXISTS idx_e_way_bills_status ON public.e_way_bills(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.e_way_bills TO authenticated;
GRANT ALL ON public.e_way_bills TO service_role;

ALTER TABLE public.e_way_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ewb read"
ON public.e_way_bills FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'sales')
  OR EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = e_way_bills.invoice_id
      AND public.has_role(auth.uid(), 'customer')
      AND i.party_id IN (SELECT id FROM public.parties WHERE user_id = auth.uid())
  )
);

CREATE POLICY "ewb write admin/sales"
ON public.e_way_bills FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));

CREATE TRIGGER touch_e_way_bills_updated_at
BEFORE UPDATE ON public.e_way_bills
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();