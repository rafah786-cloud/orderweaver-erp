-- These seven existing tables contain accounting/stock/audit data. Leave all rows and business functions unchanged.
-- Reads of the six formerly unprotected tables are restricted to administrators;
-- direct user writes are denied. Privileged server processes retain service_role access.
REVOKE ALL ON TABLE public.accounting_opening_snapshot, public.bills, public.bill_allocations, public.stock_reservations, public.stock_postings, public.invoice_tax_snapshots FROM anon, authenticated;
GRANT SELECT ON TABLE public.accounting_opening_snapshot, public.bills, public.bill_allocations, public.stock_reservations, public.stock_postings, public.invoice_tax_snapshots TO authenticated;
GRANT ALL ON TABLE public.accounting_opening_snapshot, public.bills, public.bill_allocations, public.stock_reservations, public.stock_postings, public.invoice_tax_snapshots TO service_role;

ALTER TABLE public.accounting_opening_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_tax_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read opening accounting snapshots" ON public.accounting_opening_snapshot FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read bills" ON public.bills FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read bill allocations" ON public.bill_allocations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read stock reservations" ON public.stock_reservations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read stock postings" ON public.stock_postings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read invoice tax snapshots" ON public.invoice_tax_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- AI audit entries already originate in the privileged server-side audit helper.
-- Remove the unverified client insert route; preserve the existing admin read policy.
REVOKE INSERT ON TABLE public.ai_audit_log FROM anon, authenticated;
DROP POLICY IF EXISTS "Signed-in users can append to the AI audit log" ON public.ai_audit_log;