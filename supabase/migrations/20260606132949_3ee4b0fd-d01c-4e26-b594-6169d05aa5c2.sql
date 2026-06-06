
-- Suppliers portal fields
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS state_code text,
  ADD COLUMN IF NOT EXISTS pin_code text,
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_user_id_uidx ON public.suppliers(user_id) WHERE user_id IS NOT NULL;

-- Vendor read policy on suppliers (own row only)
DROP POLICY IF EXISTS "sup_vendor_read" ON public.suppliers;
CREATE POLICY "sup_vendor_read" ON public.suppliers
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'vendor'::app_role) AND user_id = auth.uid());

-- Vendor update own contact details
DROP POLICY IF EXISTS "sup_vendor_update_own" ON public.suppliers;
CREATE POLICY "sup_vendor_update_own" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'vendor'::app_role) AND user_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'vendor'::app_role) AND user_id = auth.uid());

-- Purchase bills acknowledgement fields
ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS vendor_ack_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS vendor_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_ack_note text,
  ADD COLUMN IF NOT EXISTS expected_dispatch_date date;

ALTER TABLE public.purchase_bills DROP CONSTRAINT IF EXISTS purchase_bills_vendor_ack_status_chk;
ALTER TABLE public.purchase_bills ADD CONSTRAINT purchase_bills_vendor_ack_status_chk
  CHECK (vendor_ack_status IN ('pending','accepted','rejected','cancelled'));

-- Vendor read own POs
DROP POLICY IF EXISTS "pb_vendor_read" ON public.purchase_bills;
CREATE POLICY "pb_vendor_read" ON public.purchase_bills
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'vendor'::app_role)
    AND supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

-- Vendor update ack fields on own POs
DROP POLICY IF EXISTS "pb_vendor_ack" ON public.purchase_bills;
CREATE POLICY "pb_vendor_ack" ON public.purchase_bills
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'vendor'::app_role)
    AND supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'vendor'::app_role)
    AND supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

-- Vendor read items on own POs
DROP POLICY IF EXISTS "pbi_vendor_read" ON public.purchase_bill_items;
CREATE POLICY "pbi_vendor_read" ON public.purchase_bill_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_bills pb
      WHERE pb.id = purchase_bill_items.purchase_bill_id
        AND has_role(auth.uid(), 'vendor'::app_role)
        AND pb.supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
    )
  );

-- Vendor read own ledger
DROP POLICY IF EXISTS "sle_vendor_read" ON public.supplier_ledger_entries;
CREATE POLICY "sle_vendor_read" ON public.supplier_ledger_entries
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'vendor'::app_role)
    AND supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

-- 4. notification_log table
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'whatsapp',
  recipient_phone text,
  party_kind text NOT NULL,
  party_id uuid,
  event_type text NOT NULL,
  ref_table text,
  ref_id uuid,
  status text NOT NULL DEFAULT 'sent',
  error text,
  payload jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_log_party_kind_chk CHECK (party_kind IN ('customer','vendor','staff','admin')),
  CONSTRAINT notification_log_status_chk CHECK (status IN ('sent','failed','skipped'))
);
GRANT SELECT, INSERT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nl admin read" ON public.notification_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "nl customer read own" ON public.notification_log
  FOR SELECT TO authenticated
  USING (
    party_kind = 'customer'
    AND has_role(auth.uid(),'customer'::app_role)
    AND party_id IN (SELECT id FROM public.parties WHERE user_id = auth.uid())
  );

CREATE POLICY "nl vendor read own" ON public.notification_log
  FOR SELECT TO authenticated
  USING (
    party_kind = 'vendor'
    AND has_role(auth.uid(),'vendor'::app_role)
    AND party_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

CREATE POLICY "nl insert authed" ON public.notification_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 5. vendor_invites
CREATE TABLE IF NOT EXISTS public.vendor_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_invites_supplier_idx ON public.vendor_invites(supplier_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_invites TO authenticated;
GRANT ALL ON public.vendor_invites TO service_role;
ALTER TABLE public.vendor_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vi admin all" ON public.vendor_invites
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));
