CREATE OR REPLACE FUNCTION public.guard_vendor_supplier_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  is_vendor boolean;
BEGIN
  -- Service role / no auth context => skip
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') INTO is_admin;
  IF is_admin THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'vendor') INTO is_vendor;
  IF NOT is_vendor THEN
    RETURN NEW;
  END IF;

  -- Vendor: only allow contact/whatsapp-related fields to change.
  -- Reject any change to financial, identity, or ownership columns.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.gstin IS DISTINCT FROM OLD.gstin
     OR NEW.tally_name IS DISTINCT FROM OLD.tally_name
     OR NEW.opening_balance IS DISTINCT FROM OLD.opening_balance
     OR NEW.current_balance IS DISTINCT FROM OLD.current_balance
     OR NEW.opening_balance_date IS DISTINCT FROM OLD.opening_balance_date
     OR NEW.credit_limit IS DISTINCT FROM OLD.credit_limit
     OR NEW.credit_days IS DISTINCT FROM OLD.credit_days
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.ledger_account_id IS DISTINCT FROM OLD.ledger_account_id
  THEN
    RAISE EXCEPTION 'Vendors cannot modify financial or identity fields on supplier records';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_vendor_supplier_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_vendor_supplier_update ON public.suppliers;
CREATE TRIGGER trg_guard_vendor_supplier_update
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_supplier_update();