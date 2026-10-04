-- PREPARED ONLY. These definitions are not installed automatically.
-- Compatibility posting functions for the current voucher/bill schema.
-- They preserve historical rows and create compensating postings instead of editing posted entries.

CREATE OR REPLACE FUNCTION public.reverse_gl_voucher(
  p_voucher uuid,
  p_date date,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  original record;
  existing uuid;
  reversal_key text;
  entries jsonb;
  reversal uuid;
BEGIN
  IF p_voucher IS NULL THEN RAISE EXCEPTION 'voucher required'; END IF;
  SELECT * INTO original FROM public.vouchers WHERE id = p_voucher FOR UPDATE;
  IF original.id IS NULL THEN RAISE EXCEPTION 'voucher not found'; END IF;
  IF COALESCE(original.is_locked, false) = false THEN RAISE EXCEPTION 'only posted vouchers can be reversed'; END IF;

  reversal_key := 'reversal:' || p_voucher::text;
  SELECT id INTO existing FROM public.vouchers WHERE idempotency_key = reversal_key LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'ledger_account_id', ve.ledger_account_id,
    'debit', ve.credit,
    'credit', ve.debit
  ) ORDER BY ve.line_order)
  INTO entries
  FROM public.voucher_entries ve
  WHERE ve.voucher_id = p_voucher;
  IF entries IS NULL OR jsonb_array_length(entries) < 2 THEN RAISE EXCEPTION 'voucher has no reversible entries'; END IF;

  SELECT x.id INTO reversal
  FROM public.create_gl_voucher(
    original.voucher_type::text,
    COALESCE(p_date, CURRENT_DATE),
    entries,
    COALESCE(p_reason, 'Voucher reversal'),
    'REV-' || original.voucher_number,
    reversal_key
  ) AS x;
  RETURN reversal;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_gl_voucher(
  p_voucher uuid,
  p_date date,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.reverse_gl_voucher(p_voucher, p_date, COALESCE(p_reason, 'Voucher cancellation'));
END $$;

CREATE OR REPLACE FUNCTION public.ensure_invoice_bill(p_invoice uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing uuid;
  inv record;
  party_ledger uuid;
  sales_ledger uuid;
  voucher_id uuid;
  voucher_entry_id uuid;
  created uuid;
BEGIN
  SELECT id INTO existing FROM public.bills WHERE source_invoice_id = p_invoice LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invoice missing'; END IF;
  IF inv.party_id IS NULL THEN RAISE EXCEPTION 'invoice party missing'; END IF;
  IF COALESCE(inv.tax_amount, 0) <> 0 THEN RAISE EXCEPTION 'taxed invoice requires explicit tax components before GL posting'; END IF;

  party_ledger := public.get_or_create_party_ledger(inv.party_id);
  SELECT id INTO sales_ledger FROM public.ledger_accounts WHERE name = 'Sales' AND is_active LIMIT 1;
  IF sales_ledger IS NULL THEN RAISE EXCEPTION 'Sales ledger required'; END IF;

  SELECT id INTO voucher_id FROM public.vouchers WHERE idempotency_key = 'invoice:' || p_invoice::text LIMIT 1;
  IF voucher_id IS NULL THEN
    SELECT x.id INTO voucher_id
    FROM public.create_gl_voucher(
      'sales', COALESCE(inv.invoice_date, CURRENT_DATE),
      jsonb_build_array(
        jsonb_build_object('ledger_account_id', party_ledger, 'debit', inv.total_amount, 'credit', 0),
        jsonb_build_object('ledger_account_id', sales_ledger, 'debit', 0, 'credit', inv.total_amount)
      ), 'Invoice bill', inv.invoice_number, 'invoice:' || p_invoice::text
    ) AS x;
  END IF;

  SELECT ve.id INTO voucher_entry_id
  FROM public.voucher_entries ve
  WHERE ve.voucher_id = voucher_id AND ve.ledger_account_id = party_ledger
  ORDER BY ve.line_order LIMIT 1;
  IF voucher_entry_id IS NULL THEN RAISE EXCEPTION 'invoice voucher has no party entry'; END IF;

  INSERT INTO public.bills(
    party_kind, party_id, ledger_account_id, bill_reference, bill_date, due_date,
    reference_type, original_amount, source_voucher_id, source_voucher_entry_id,
    external_ref, source_invoice_id
  ) VALUES (
    'customer', inv.party_id, party_ledger, inv.invoice_number,
    COALESCE(inv.invoice_date, CURRENT_DATE), inv.due_date, 'new_ref', inv.total_amount,
    voucher_id, voucher_entry_id, 'invoice:' || p_invoice::text, p_invoice
  )
  ON CONFLICT (source_invoice_id) DO UPDATE SET source_invoice_id = EXCLUDED.source_invoice_id
  RETURNING id INTO created;
  RETURN created;
END $$;

CREATE OR REPLACE FUNCTION public.record_invoice_receipt(p_invoice uuid, p_amount numeric, p_idempotency text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing uuid;
  bill uuid;
  inv record;
  party_ledger uuid;
  cash uuid;
  voucher_id uuid;
  voucher_entry_id uuid;
  outstanding numeric;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'receipt amount must be positive'; END IF;
  IF p_idempotency IS NULL OR length(trim(p_idempotency)) < 8 THEN RAISE EXCEPTION 'idempotency key required'; END IF;
  SELECT a.id, a.bill_id INTO existing, bill FROM public.bill_allocations a WHERE a.idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN public.bill_outstanding(bill); END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invoice missing'; END IF;
  IF inv.status = 'cancelled' THEN RAISE EXCEPTION 'invoice cancelled'; END IF;
  bill := public.ensure_invoice_bill(p_invoice);
  PERFORM 1 FROM public.bills WHERE id = bill FOR UPDATE;
  outstanding := public.bill_outstanding(bill);
  IF p_amount > outstanding + 0.01 THEN RAISE EXCEPTION 'settlement exceeds outstanding'; END IF;
  party_ledger := public.get_or_create_party_ledger(inv.party_id);
  SELECT id INTO cash FROM public.ledger_accounts WHERE name = 'Cash' AND is_active LIMIT 1;
  IF cash IS NULL THEN RAISE EXCEPTION 'Cash ledger required'; END IF;
  SELECT x.id INTO voucher_id
  FROM public.create_gl_voucher('receipt', CURRENT_DATE,
    jsonb_build_array(
      jsonb_build_object('ledger_account_id', cash, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('ledger_account_id', party_ledger, 'debit', 0, 'credit', p_amount)
    ), 'Invoice receipt', inv.invoice_number, p_idempotency) AS x;
  SELECT ve.id INTO voucher_entry_id FROM public.voucher_entries ve
  WHERE ve.voucher_id = voucher_id AND ve.ledger_account_id = party_ledger ORDER BY ve.line_order DESC LIMIT 1;
  IF voucher_entry_id IS NULL THEN RAISE EXCEPTION 'receipt voucher has no party entry'; END IF;
  INSERT INTO public.bill_allocations(
    bill_id, settlement_voucher_id, settlement_voucher_entry_id, allocation_type,
    allocation_date, amount, effect, idempotency_key
  ) VALUES (bill, voucher_id, voucher_entry_id, 'against_ref', CURRENT_DATE, p_amount, 1, p_idempotency);
  UPDATE public.invoices
  SET paid_amount = inv.total_amount - public.bill_outstanding(bill),
      status = CASE WHEN public.bill_outstanding(bill) <= 0.01 THEN 'paid' ELSE 'partial' END
  WHERE id = p_invoice;
  RETURN public.bill_outstanding(bill);
END $$;

CREATE OR REPLACE FUNCTION public.reverse_invoice(p_invoice uuid, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing uuid; inv record; bill record; reversal uuid;
BEGIN
  IF p_idempotency IS NULL OR length(trim(p_idempotency)) < 8 THEN RAISE EXCEPTION 'idempotency key required'; END IF;
  SELECT id INTO existing FROM public.vouchers WHERE idempotency_key = p_idempotency LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invoice missing'; END IF;
  IF inv.status = 'cancelled' THEN RAISE EXCEPTION 'invoice already cancelled'; END IF;
  SELECT * INTO bill FROM public.bills WHERE source_invoice_id = p_invoice LIMIT 1 FOR UPDATE;
  IF bill.id IS NULL OR bill.source_voucher_id IS NULL THEN RAISE EXCEPTION 'invoice has no source voucher; refusing to invent reversal'; END IF;
  reversal := public.reverse_gl_voucher(bill.source_voucher_id, CURRENT_DATE, 'Invoice reversal');
  UPDATE public.bills SET status = 'cancelled' WHERE id = bill.id;
  UPDATE public.invoices SET status = 'cancelled' WHERE id = p_invoice;
  RETURN reversal;
END $$;

-- Tax snapshot remains deliberately blocked: the current invoice schema stores only aggregate tax_amount.
-- CGST/SGST/IGST/cess must be stored by the invoice workflow before tax accounting is enabled.

REVOKE ALL ON FUNCTION public.reverse_gl_voucher(uuid,date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_gl_voucher(uuid,date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_invoice_bill(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_invoice_receipt(uuid,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_invoice(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_gl_voucher(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_gl_voucher(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_invoice_bill(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_receipt(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_invoice(uuid,text) TO authenticated;
