DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'apply_punch_to_attendance()',
    'post_purchase_item_to_movement()',
    'create_production_order()',
    'touch_updated_at()',
    'apply_purchase_stock()',
    'handle_new_user()',
    'post_sales_item_to_movement()',
    'log_voucher_entry_changes()',
    'get_or_create_party_ledger(uuid)',
    'next_voucher_number(public.voucher_type)',
    'apply_sales_stock_out()',
    'log_voucher_changes()',
    'enforce_voucher_period_lock()',
    'post_purchase_to_voucher()',
    'get_or_create_supplier_ledger(uuid)',
    'post_invoice_to_voucher()',
    'post_voucher_to_bank_txn()',
    'check_voucher_balanced(uuid)',
    'recalc_attendance_day(uuid, date)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;