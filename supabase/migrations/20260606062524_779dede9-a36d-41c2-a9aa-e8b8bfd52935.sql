-- Revoke EXECUTE on internal trigger and helper functions from end-user roles.
-- These functions are invoked by triggers or other SECURITY DEFINER paths,
-- and should NOT be callable directly via the Data API. has_role / is_approved
-- / is_period_locked / current_user_roles remain callable because RLS policies
-- and client code legitimately reference them.

REVOKE EXECUTE ON FUNCTION public.apply_punch_to_attendance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_production_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_attendance_day(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_purchase_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_sales_item_to_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_voucher_balanced(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_voucher_entry_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_party_ledger(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_voucher_number(voucher_type) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_sales_stock_out() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_voucher_period_lock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_voucher_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_purchase_to_voucher() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_supplier_ledger(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_voucher_to_bank_txn() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_purchase_item_to_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_invoice_to_voucher() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;