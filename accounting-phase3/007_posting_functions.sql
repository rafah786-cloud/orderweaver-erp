-- NOT INSTALLED.
-- Compatibility posting functions for the live schema.
-- Prerequisite: accounting-phase3/006_gl_voucher.sql must be installed first.
-- This file intentionally does NOT rewrite historical vouchers, bills, invoices or stock.
-- It does NOT invent tax splits and does NOT assume a global "Debtors" ledger.

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

  party_ledger := public.get_or_create_party_ledger(inv.party_id);
  SELECT id INTO sales_ledger FROM public.ledger_accounts WHERE name = 'Sales' AND is_active LIMIT 1;
  IF sales_ledger IS NULL THEN RAISE EXCEPTION 'Sales ledger required'; END IF;

  -- Reuse the canonical invoice posting when the invoice screen already posted it.
  -- This prevents receipt creation from generating a second GL voucher for the same invoice.
  SELECT id INTO voucher_id
  FROM public.vouchers
  WHERE idempotency_key = 'invoice:' || p_invoice::text
  LIMIT 1;

  IF voucher_id IS NULL THEN
    SELECT x.id INTO voucher_id
    FROM public.create_gl_voucher('sales', COALESCE(inv.invoice_date, CURRENT_DATE),
      jsonb_build_array(
        jsonb_build_object('ledger_account_id', party_ledger, 'debit', inv.total_amount, 'credit', 0),
        jsonb_build_object('ledger_account_id', sales_ledger, 'debit', 0, 'credit', inv.total_amount)
      ), 'Invoice bill', inv.invoice_number, 'invoice:' || p_invoice::text) AS x;
  END IF;

  SELECT ve.id INTO voucher_entry_id
  FROM public.voucher_entries ve
  WHERE ve.voucher_id = voucher_id
  ORDER BY ve.line_order
  LIMIT 1;
  IF voucher_entry_id IS NULL THEN RAISE EXCEPTION 'invoice voucher has no entries'; END IF;

  INSERT INTO public.bills(
    party_kind, party_id, ledger_account_id, bill_reference, bill_date, due_date,
    reference_type, original_amount, source_voucher_id, source_voucher_entry_id,
    external_ref, source_invoice_id
  )
  VALUES (
    'customer', inv.party_id, party_ledger, inv.invoice_number,
    COALESCE(inv.invoice_date, CURRENT_DATE), inv.due_date, 'new_ref', inv.total_amount,
    voucher_id, voucher_entry_id, 'invoice:' || p_invoice::text, p_invoice
  )
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

  SELECT id INTO existing FROM public.bill_allocations WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN
    SELECT b.source_invoice_id INTO bill FROM public.bills b
    JOIN public.bill_allocations a ON a.bill_id = b.id
    WHERE a.id = existing;
    RETURN public.bill_outstanding(bill);
  END IF;

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

  SELECT ve.id INTO voucher_entry_id
  FROM public.voucher_entries ve
  WHERE ve.voucher_id = voucher_id
  ORDER BY ve.line_order
  LIMIT 1;
  IF voucher_entry_id IS NULL THEN RAISE EXCEPTION 'receipt voucher has no entries'; END IF;

  INSERT INTO public.bill_allocations(
    bill_id, settlement_voucher_id, settlement_voucher_entry_id, allocation_type,
    allocation_date, amount, effect, idempotency_key
  )
  VALUES (bill, voucher_id, voucher_entry_id, 'against_ref', CURRENT_DATE, p_amount, 1, p_idempotency);

  UPDATE public.invoices
  SET paid_amount = inv.total_amount - public.bill_outstanding(bill),
      status = CASE WHEN public.bill_outstanding(bill) <= 0.01 THEN 'paid' ELSE 'partial' END
  WHERE id = p_invoice;

  RETURN public.bill_outstanding(bill);
END $$;

CREATE OR REPLACE FUNCTION public.reverse_invoice(p_invoice uuid, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing uuid;
  inv record;
  bill record;
  reversal uuid;
BEGIN
  IF p_idempotency IS NULL OR length(trim(p_idempotency)) < 8 THEN RAISE EXCEPTION 'idempotency key required'; END IF;
  SELECT id INTO existing FROM public.vouchers WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invoice missing'; END IF;
  IF inv.status = 'cancelled' THEN RAISE EXCEPTION 'invoice already cancelled'; END IF;

  SELECT * INTO bill FROM public.bills WHERE source_invoice_id = p_invoice LIMIT 1 FOR UPDATE;
  IF bill.id IS NULL OR bill.source_voucher_id IS NULL THEN
    RAISE EXCEPTION 'invoice has no source voucher; refusing to invent reversal';
  END IF;

  reversal := public.reverse_gl_voucher(bill.source_voucher_id, CURRENT_DATE, 'Invoice reversal');
  UPDATE public.bills SET status = 'cancelled' WHERE id = bill.id;
  UPDATE public.invoices SET status = 'cancelled' WHERE id = p_invoice;
  RETURN reversal;
END $$;

-- Tax snapshot intentionally remains unimplemented here. The current invoice schema stores aggregate tax_amount but not CGST/SGST/IGST/cess components. A tax split must never be invented.
