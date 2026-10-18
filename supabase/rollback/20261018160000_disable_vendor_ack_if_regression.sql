-- Emergency-safe rollback for the vendor acknowledgement hardening.
-- Do NOT restore the earlier guard function: it omitted fields that could trigger
-- purchase posting. This disables vendor acknowledgements until a corrected
-- migration is ready while retaining vendor read access under pb_vendor_read.
BEGIN;
DROP POLICY IF EXISTS pb_vendor_ack ON public.purchase_bills;
COMMIT;
