DROP POLICY IF EXISTS "audit insert" ON public.voucher_audit_log;

CREATE POLICY "audit insert admin/accountant"
ON public.voucher_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
);