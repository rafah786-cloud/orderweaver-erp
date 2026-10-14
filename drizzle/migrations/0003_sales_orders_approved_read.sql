-- A restrictive read gate composes with both SELECT and ALL permissive policies.
-- Preserve existing role, creator/customer, and active-company authorization.
CREATE POLICY "sales_orders_approved_read" ON public.sales_orders
AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.is_approved(auth.uid()));