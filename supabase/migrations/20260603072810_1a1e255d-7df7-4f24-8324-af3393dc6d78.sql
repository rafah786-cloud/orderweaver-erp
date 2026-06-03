
REVOKE EXECUTE ON FUNCTION public.next_voucher_number(public.voucher_type) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_voucher_balanced(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_party_ledger(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_supplier_ledger(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_invoice_to_voucher() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_purchase_to_voucher() FROM PUBLIC, anon, authenticated;
