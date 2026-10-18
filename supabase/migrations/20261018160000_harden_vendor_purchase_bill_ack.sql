BEGIN;

-- A vendor may acknowledge a pending purchase order and provide an expected
-- dispatch date/note, but cannot edit the buyer's accounting or receipt fields.
-- This is enforced at the database boundary, not just by the vendor UI.
CREATE OR REPLACE FUNCTION public.guard_vendor_purchase_bill_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'vendor'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN

    -- Protect every commercial, tax, identity, company and receipt field.
    -- expected_dispatch_date is intentionally excluded: it is part of a
    -- vendor's one-time acknowledgement when accepting an order.
    IF ROW(
      NEW.id,
      NEW.company_id,
      NEW.bill_number,
      NEW.bill_date,
      NEW.supplier_id,
      NEW.total_amount,
      NEW.subtotal,
      NEW.tax_amount,
      NEW.cgst_amount,
      NEW.sgst_amount,
      NEW.igst_amount,
      NEW.supplier_gstin,
      NEW.place_of_supply,
      NEW.reverse_charge,
      NEW.invoice_type,
      NEW.eligibility_for_itc,
      NEW.notes,
      NEW.created_by,
      NEW.created_at,
      NEW.receipt_status
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.company_id,
      OLD.bill_number,
      OLD.bill_date,
      OLD.supplier_id,
      OLD.total_amount,
      OLD.subtotal,
      OLD.tax_amount,
      OLD.cgst_amount,
      OLD.sgst_amount,
      OLD.igst_amount,
      OLD.supplier_gstin,
      OLD.place_of_supply,
      OLD.reverse_charge,
      OLD.invoice_type,
      OLD.eligibility_for_itc,
      OLD.notes,
      OLD.created_by,
      OLD.created_at,
      OLD.receipt_status
    ) THEN
      RAISE EXCEPTION 'Vendors cannot change purchase-bill commercial, tax, receipt or ownership fields';
    END IF;

    -- A vendor receives one acknowledgement decision per pending order.
    -- After acceptance/rejection, even an identical status cannot be used to
    -- reopen or rewrite the acknowledgement through direct REST/API calls.
    IF OLD.vendor_ack_status <> 'pending' THEN
      IF ROW(
        NEW.vendor_ack_status,
        NEW.vendor_ack_at,
        NEW.vendor_ack_note,
        NEW.expected_dispatch_date
      ) IS DISTINCT FROM ROW(
        OLD.vendor_ack_status,
        OLD.vendor_ack_at,
        OLD.vendor_ack_note,
        OLD.expected_dispatch_date
      ) THEN
        RAISE EXCEPTION 'This purchase order has already been acknowledged';
      END IF;
    ELSIF NEW.vendor_ack_status IS DISTINCT FROM OLD.vendor_ack_status THEN
      IF NEW.vendor_ack_status NOT IN ('accepted', 'rejected') THEN
        RAISE EXCEPTION 'A pending purchase order can only be accepted or rejected';
      END IF;

      -- Use database time, never a vendor-supplied acknowledgement timestamp.
      NEW.vendor_ack_at := now();
      IF NEW.vendor_ack_status = 'rejected' THEN
        NEW.expected_dispatch_date := NULL;
      END IF;
    ELSIF NEW.vendor_ack_at IS DISTINCT FROM OLD.vendor_ack_at
       OR NEW.vendor_ack_note IS DISTINCT FROM OLD.vendor_ack_note
       OR NEW.expected_dispatch_date IS DISTINCT FROM OLD.expected_dispatch_date THEN
      RAISE EXCEPTION 'Acknowledgement fields can only change with the initial decision';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- The live database had two triggers calling this same guard. Replace them
-- with one canonical trigger to keep the boundary unambiguous.
DROP TRIGGER IF EXISTS trg_guard_vendor_pb_update ON public.purchase_bills;
DROP TRIGGER IF EXISTS trg_guard_vendor_purchase_bill_update ON public.purchase_bills;
CREATE TRIGGER trg_guard_vendor_purchase_bill_update
  BEFORE UPDATE ON public.purchase_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_vendor_purchase_bill_update();

COMMIT;
