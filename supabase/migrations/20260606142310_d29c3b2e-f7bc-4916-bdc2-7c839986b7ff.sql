-- Restrict vendor updates on purchase_bills to acknowledgement columns only
CREATE OR REPLACE FUNCTION public.guard_vendor_purchase_bill_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the caller is acting as a vendor (and not an admin)
  IF public.has_role(auth.uid(), 'vendor') AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.bill_number       IS DISTINCT FROM OLD.bill_number
    OR NEW.bill_date         IS DISTINCT FROM OLD.bill_date
    OR NEW.supplier_id       IS DISTINCT FROM OLD.supplier_id
    OR NEW.subtotal          IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_amount        IS DISTINCT FROM OLD.tax_amount
    OR NEW.total_amount      IS DISTINCT FROM OLD.total_amount
    OR NEW.supplier_gstin    IS DISTINCT FROM OLD.supplier_gstin
    OR NEW.place_of_supply   IS DISTINCT FROM OLD.place_of_supply
    OR NEW.reverse_charge    IS DISTINCT FROM OLD.reverse_charge
    OR NEW.invoice_type      IS DISTINCT FROM OLD.invoice_type
    OR NEW.eligibility_for_itc IS DISTINCT FROM OLD.eligibility_for_itc
    OR NEW.notes             IS DISTINCT FROM OLD.notes
    OR NEW.created_by        IS DISTINCT FROM OLD.created_by
    OR NEW.created_at        IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Vendors can only update acknowledgement fields on purchase_bills';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_vendor_pb_update ON public.purchase_bills;
CREATE TRIGGER trg_guard_vendor_pb_update
BEFORE UPDATE ON public.purchase_bills
FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_purchase_bill_update();