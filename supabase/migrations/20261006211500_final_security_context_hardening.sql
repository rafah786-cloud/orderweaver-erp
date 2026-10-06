BEGIN;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
  SELECT p.active_company_id
  FROM public.profiles p
  JOIN public.companies c
    ON c.id=p.active_company_id
   AND c.is_active=true
  WHERE p.id=auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_company_access a
      WHERE a.user_id=auth.uid()
        AND a.company_id=p.active_company_id
        AND a.can_view=true
    )
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.active_company_id IS DISTINCT FROM OLD.active_company_id
       OR NEW.id IS DISTINCT FROM OLD.id
    THEN
      RAISE EXCEPTION 'Users cannot change protected account fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_invoice_tax(p_invoice uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  company uuid:=public.current_company_id();
BEGIN
  IF company IS NULL OR NOT public.has_company_access(company) THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'sales')
  ) THEN
    RAISE EXCEPTION 'Sales or accounting access required';
  END IF;

  SELECT * INTO inv
  FROM public.invoices
  WHERE id=p_invoice AND company_id=company
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found in active company'; END IF;

  IF round(
      COALESCE(inv.cgst_amount,0)+COALESCE(inv.sgst_amount,0)+COALESCE(inv.igst_amount,0),2
    )<>round(COALESCE(inv.tax_amount,0),2)
  THEN
    RAISE EXCEPTION 'Invoice tax components do not equal tax amount';
  END IF;

  IF COALESCE(inv.tax_amount,0)=0 THEN
    DELETE FROM public.invoice_tax_snapshots
    WHERE invoice_id=p_invoice AND company_id=company;
    RETURN;
  END IF;

  INSERT INTO public.invoice_tax_snapshots(
    invoice_id,taxable_value,cgst,sgst,igst,cess,company_id
  )
  VALUES(
    p_invoice,COALESCE(inv.subtotal,0),COALESCE(inv.cgst_amount,0),
    COALESCE(inv.sgst_amount,0),COALESCE(inv.igst_amount,0),0,company
  )
  ON CONFLICT(invoice_id) DO UPDATE SET
    taxable_value=EXCLUDED.taxable_value,
    cgst=EXCLUDED.cgst,
    sgst=EXCLUDED.sgst,
    igst=EXCLUDED.igst,
    cess=EXCLUDED.cess,
    company_id=EXCLUDED.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_invoice_tax(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_company_access(uuid,uuid[]) FROM PUBLIC, anon, authenticated;

COMMIT;