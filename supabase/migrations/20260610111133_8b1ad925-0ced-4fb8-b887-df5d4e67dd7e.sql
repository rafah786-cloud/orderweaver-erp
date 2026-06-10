-- 1) Restrict notification_providers read to admins only
DROP POLICY IF EXISTS "np read staff" ON public.notification_providers;
CREATE POLICY "np read admin"
ON public.notification_providers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Tighten sales_order_items WITH CHECK to match USING scope
DROP POLICY IF EXISTS "soi access" ON public.sales_order_items;
CREATE POLICY "soi access"
ON public.sales_order_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales_orders so
    WHERE so.id = sales_order_items.sales_order_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'production'::public.app_role)
        OR (public.has_role(auth.uid(), 'sales'::public.app_role) AND so.created_by = auth.uid())
        OR (public.has_role(auth.uid(), 'customer'::public.app_role) AND so.party_id IN (
          SELECT parties.id FROM public.parties WHERE parties.user_id = auth.uid()
        ))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales_orders so
    WHERE so.id = sales_order_items.sales_order_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (public.has_role(auth.uid(), 'sales'::public.app_role) AND so.created_by = auth.uid())
      )
  )
);