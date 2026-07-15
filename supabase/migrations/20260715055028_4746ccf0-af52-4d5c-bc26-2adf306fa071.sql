
-- 1. Scope currency/exchange_rate reads to approved users only
DROP POLICY IF EXISTS "cur read" ON public.currencies;
DROP POLICY IF EXISTS "er read" ON public.exchange_rates;
CREATE POLICY "cur read" ON public.currencies FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "er read" ON public.exchange_rates FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));

-- 2. Belt-and-suspenders: revoke column-level SELECT on device_settings.api_key_hash from client roles
REVOKE SELECT (api_key_hash) ON public.device_settings FROM anon, authenticated;

-- 3. Lock down SECURITY DEFINER functions: revoke EXECUTE from PUBLIC/anon/authenticated on
--    internal/trigger functions. Keep has_role and is_approved callable by authenticated because
--    they are referenced from RLS policies.
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'apply_punch_to_attendance()',
    'touch_updated_at()',
    'create_production_order()',
    'apply_purchase_stock()',
    'post_sales_item_to_movement()',
    'handle_new_user()',
    'log_voucher_entry_changes()',
    'apply_sales_stock_out()',
    'enforce_voucher_period_lock()',
    'log_voucher_changes()',
    'post_purchase_to_voucher()',
    'guard_vendor_purchase_bill_update()',
    'guard_vendor_supplier_update()',
    'post_purchase_item_to_movement()',
    'post_invoice_to_voucher()',
    'guard_profile_self_update()',
    'post_voucher_to_bank_txn()',
    'recalc_attendance_day(uuid, date)',
    'get_or_create_party_ledger(uuid)',
    'get_or_create_supplier_ledger(uuid)',
    'next_voucher_number(voucher_type)',
    'check_voucher_balanced(uuid)',
    'current_user_roles()',
    'is_period_locked(date)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;
