BEGIN;

-- The application exposes invoice screens to accountants. Preserve the existing
-- admin/sales-owner/customer visibility rules while granting accountants read-only
-- access to invoices and their lines within the active company RLS boundary.
DROP POLICY IF EXISTS "inv read" ON public.invoices;
CREATE POLICY "inv read" ON public.invoices
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::public.app_role)
  OR has_role(auth.uid(), 'accountant'::public.app_role)
  OR (has_role(auth.uid(), 'sales'::public.app_role) AND created_by = auth.uid())
  OR (
    has_role(auth.uid(), 'customer'::public.app_role)
    AND party_id IN (SELECT p.id FROM public.parties p WHERE p.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
CREATE POLICY "invoice_items_select" ON public.invoice_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND (
        has_role(auth.uid(), 'admin'::public.app_role)
        OR has_role(auth.uid(), 'accountant'::public.app_role)
        OR (has_role(auth.uid(), 'sales'::public.app_role) AND i.created_by = auth.uid())
        OR (
          has_role(auth.uid(), 'customer'::public.app_role)
          AND i.party_id IN (SELECT p.id FROM public.parties p WHERE p.user_id = auth.uid())
        )
      )
  )
);

COMMIT;
