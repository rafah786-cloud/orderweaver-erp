
-- HSN/SAC master
CREATE TABLE public.hsn_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL,
  type text NOT NULL DEFAULT 'HSN', -- HSN or SAC
  default_tax_rate numeric NOT NULL DEFAULT 18,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hsn_codes TO authenticated;
GRANT ALL ON public.hsn_codes TO service_role;
ALTER TABLE public.hsn_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hsn read" ON public.hsn_codes FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')
         OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'production'));
CREATE POLICY "hsn write" ON public.hsn_codes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'));

-- GST rate-change history (so old invoices keep old rates)
CREATE TABLE public.gst_rate_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hsn_code text NOT NULL,
  old_rate numeric NOT NULL,
  new_rate numeric NOT NULL,
  effective_from date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gst_rate_changes TO authenticated;
GRANT ALL ON public.gst_rate_changes TO service_role;
ALTER TABLE public.gst_rate_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grc read" ON public.gst_rate_changes FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'));
CREATE POLICY "grc write" ON public.gst_rate_changes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'));

-- GST returns
CREATE TABLE public.gst_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_type text NOT NULL, -- GSTR-1, GSTR-3B, GSTR-9
  period_year int NOT NULL,
  period_month int, -- nullable for annual GSTR-9
  gstin text NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft, generated, filed
  payload jsonb,
  summary jsonb,
  filed_at timestamptz,
  filed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_type, period_year, period_month, gstin)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gst_returns TO authenticated;
GRANT ALL ON public.gst_returns TO service_role;
ALTER TABLE public.gst_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gr read" ON public.gst_returns FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'));
CREATE POLICY "gr write" ON public.gst_returns FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'));

-- E-invoices (IRN registry)
CREATE TABLE public.e_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  irn text UNIQUE,
  ack_no text,
  ack_date timestamptz,
  signed_qr text,
  signed_invoice text,
  status text NOT NULL DEFAULT 'pending', -- pending, generated, cancelled
  cancel_reason text,
  cancelled_at timestamptz,
  request_payload jsonb,
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.e_invoices TO authenticated;
GRANT ALL ON public.e_invoices TO service_role;
ALTER TABLE public.e_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "einv read" ON public.e_invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'sales'));
CREATE POLICY "einv write" ON public.e_invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'sales'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'sales'));

-- Extend invoices with GST classification
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS reverse_charge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'regular', -- regular, export, sez, bill_of_supply, deemed_export
  ADD COLUMN IF NOT EXISTS export_type text; -- WPAY, WOPAY (for export/sez)

ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS reverse_charge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS eligibility_for_itc text NOT NULL DEFAULT 'inputs', -- inputs, capital_goods, input_services, ineligible
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_gstin text;

CREATE INDEX IF NOT EXISTS idx_einvoices_invoice ON public.e_invoices(invoice_id);
CREATE INDEX IF NOT EXISTS idx_gst_returns_period ON public.gst_returns(period_year, period_month);

-- updated_at triggers
CREATE TRIGGER trg_hsn_updated BEFORE UPDATE ON public.hsn_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_gr_updated BEFORE UPDATE ON public.gst_returns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_einv_updated BEFORE UPDATE ON public.e_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
