-- 1. invoice_items: enforce parent-invoice ownership on writes
DROP POLICY IF EXISTS "invi access" ON public.invoice_items;

CREATE POLICY "invoice_items_select" ON public.invoice_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_items.invoice_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'sales'::app_role) AND i.created_by = auth.uid())
      OR (has_role(auth.uid(), 'customer'::app_role) AND i.party_id IN (
            SELECT p.id FROM public.parties p WHERE p.user_id = auth.uid()))
    )
));

CREATE POLICY "invoice_items_insert" ON public.invoice_items
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_items.invoice_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'sales'::app_role) AND i.created_by = auth.uid())
    )
));

CREATE POLICY "invoice_items_update" ON public.invoice_items
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_items.invoice_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'sales'::app_role) AND i.created_by = auth.uid())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_items.invoice_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'sales'::app_role) AND i.created_by = auth.uid())
    )
));

CREATE POLICY "invoice_items_delete" ON public.invoice_items
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_items.invoice_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'sales'::app_role) AND i.created_by = auth.uid())
    )
));

-- 2. gst_rate_changes: explicit per-command write policies with checks
DROP POLICY IF EXISTS "grc write" ON public.gst_rate_changes;

CREATE POLICY "grc insert" ON public.gst_rate_changes
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "grc update" ON public.gst_rate_changes
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "grc delete" ON public.gst_rate_changes
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

-- 3. velocity_auth_token: keep fail-closed, server-only
ALTER TABLE public.velocity_auth_token ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.velocity_auth_token FROM anon, authenticated;
GRANT ALL ON public.velocity_auth_token TO service_role;