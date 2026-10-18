BEGIN;

-- Vendors can review their supplier account and acknowledge purchase orders, but
-- the portal has no supplier-master edit workflow. The existing row-scoped UPDATE
-- policy allowed direct API clients to change balances, GST data and contact
-- fields. Keep vendor read access and Admin/Production maintenance policies.
DROP POLICY IF EXISTS sup_vendor_update_own ON public.suppliers;

COMMIT;
