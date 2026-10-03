-- Not applied. Matches the live voucher, bill, and invoice tables.
-- Creates functions only. Does not update the existing 7 vouchers, 330 bills, invoices, or stock.

CREATE OR REPLACE FUNCTION public.create_gl_voucher(
  _type text, _date date, _entries jsonb, _narration text, _reference text, _idempotency_key text, _status text DEFAULT 'posted'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing uuid; voucher uuid; next_no integer; prefix text; width integer; suffix text; debit numeric := 0; credit numeric := 0; line jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT id INTO existing FROM public.vouchers WHERE reference = _idempotency_key LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(_entries) LOOP
    debit := debit + COALESCE((line->>'debit')::numeric, 0);
    credit := credit + COALESCE((line->>'credit')::numeric, 0);
  END LOOP;
  IF round(debit - credit, 2) <> 0 OR debit <= 0 THEN RAISE EXCEPTION 'unbalanced voucher'; END IF;
  UPDATE public.voucher_number_series SET next_number = next_number + 1
  WHERE voucher_type = _type::public.voucher_type
  RETURNING next_number - 1, prefix, width, suffix INTO next_no, prefix, width, suffix;
  IF next_no IS NULL THEN RAISE EXCEPTION 'voucher series missing'; END IF;
  INSERT INTO public.vouchers (voucher_type, voucher_date, voucher_number, narration, reference, is_locked)
  VALUES (_type::public.voucher_type, _date, prefix || lpad(next_no::text, width, '0') || suffix, concat_ws(' | ', _narration, _reference), _idempotency_key, true)
  RETURNING id INTO voucher;
  INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, debit, credit, line_order)
  SELECT voucher, (line->>'ledger_account_id')::uuid, COALESCE((line->>'debit')::numeric, 0), COALESCE((line->>'credit')::numeric, 0), ordinality::integer
  FROM jsonb_array_elements(_entries) WITH ORDINALITY AS t(line, ordinality);
  RETURN voucher;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_gl_voucher(_id uuid, _date date, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE original public.vouchers%ROWTYPE; entries jsonb;
BEGIN
  SELECT * INTO original FROM public.vouchers WHERE id = _id;
  IF original.id IS NULL THEN RAISE EXCEPTION 'voucher missing'; END IF;
  SELECT jsonb_agg(jsonb_build_object('ledger_account_id', ledger_account_id, 'debit', credit, 'credit', debit)) INTO entries
  FROM public.voucher_entries WHERE voucher_id = _id;
  RETURN public.create_gl_voucher(original.voucher_type::text, _date, entries, 'Reversal: ' || COALESCE(_reason, ''), original.voucher_number, 'reversal:' || _id::text, 'posted');
END $$;

CREATE OR REPLACE FUNCTION public.cancel_gl_voucher(_id uuid, _date date, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN public.reverse_gl_voucher(_id, _date, _reason); END $$;

CREATE OR REPLACE FUNCTION public.snapshot_invoice_tax(p_invoice uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record;
BEGIN
  SELECT subtotal, tax_amount INTO inv FROM public.invoices WHERE id = p_invoice;
  IF inv.subtotal IS NULL THEN RAISE EXCEPTION 'invoice missing'; END IF;
  INSERT INTO public.invoice_tax_snapshots (invoice_id, taxable_value, igst, cgst, sgst, cess)
  VALUES (p_invoice, inv.subtotal, 0, inv.tax_amount, 0, 0)
  ON CONFLICT (invoice_id) DO UPDATE SET taxable_value = EXCLUDED.taxable_value, cgst = EXCLUDED.cgst;
END $$;

CREATE OR REPLACE FUNCTION public.record_invoice_receipt(p_invoice uuid, p_amount numeric, p_idempotency text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; bill uuid; cash uuid; debtors uuid; voucher uuid; entry uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.bill_allocations WHERE idempotency_key = p_idempotency) THEN
    RETURN public.bill_outstanding((SELECT id FROM public.bills WHERE source_invoice_id = p_invoice LIMIT 1));
  END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invoice missing'; END IF;
  SELECT id INTO bill FROM public.bills WHERE source_invoice_id = p_invoice LIMIT 1;
  SELECT id INTO cash FROM public.ledger_accounts WHERE name = 'Cash' LIMIT 1;
  SELECT id INTO debtors FROM public.ledger_accounts WHERE name = 'Debtors' LIMIT 1;
  IF cash IS NULL OR debtors IS NULL THEN RAISE EXCEPTION 'Cash or Debtors ledger required'; END IF;
  voucher := public.create_gl_voucher('receipt', CURRENT_DATE, jsonb_build_array(
    jsonb_build_object('ledger_account_id', cash, 'debit', p_amount, 'credit', 0),
    jsonb_build_object('ledger_account_id', debtors, 'debit', 0, 'credit', p_amount)
  ), 'Invoice receipt', inv.invoice_number, p_idempotency, 'posted');
  SELECT id INTO entry FROM public.voucher_entries WHERE voucher_id = voucher ORDER BY line_order LIMIT 1;
  IF bill IS NOT NULL THEN
    INSERT INTO public.bill_allocations (bill_id, settlement_voucher_id, settlement_voucher_entry_id, allocation_type, amount, effect, idempotency_key)
    VALUES (bill, voucher, entry, 'against_ref', p_amount, 1, p_idempotency);
  END IF;
  UPDATE public.invoices SET paid_amount = paid_amount + p_amount,
    status = CASE WHEN paid_amount + p_amount >= total_amount - 0.01 THEN 'paid' ELSE 'partial' END
  WHERE id = p_invoice;
  RETURN inv.total_amount - inv.paid_amount - p_amount;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_invoice(p_invoice uuid, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; debtors uuid; sales uuid;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invoice missing'; END IF;
  SELECT id INTO debtors FROM public.ledger_accounts WHERE name = 'Debtors' LIMIT 1;
  SELECT id INTO sales FROM public.ledger_accounts WHERE name = 'Sales' LIMIT 1;
  IF debtors IS NULL OR sales IS NULL THEN RAISE EXCEPTION 'Debtors or Sales ledger required'; END IF;
  UPDATE public.invoices SET status = 'cancelled' WHERE id = p_invoice;
  RETURN public.create_gl_voucher('credit_note', CURRENT_DATE, jsonb_build_array(
    jsonb_build_object('ledger_account_id', sales, 'debit', inv.total_amount, 'credit', 0),
    jsonb_build_object('ledger_account_id', debtors, 'debit', 0, 'credit', inv.total_amount)
  ), 'Invoice cancellation', inv.invoice_number, p_idempotency, 'posted');
END $$;
