-- ISOLATED. Do not apply to production. Does not update existing rows.
-- Phase 2 bills and bill_allocations are the only settlement model.
-- source_invoice_id is an additive lookup column. The source voucher entry remains required.

CREATE OR REPLACE FUNCTION public.apply_purchase_stock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.material_on_hand(p_material uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(
    CASE
      WHEN sm.movement_type IN ('purchase','production_in','transfer_in','opening') THEN sm.quantity
      WHEN sm.movement_type IN ('sale','production_out','transfer_out') THEN -abs(sm.quantity)
      ELSE sm.quantity
    END
  ), 0)
  FROM public.stock_items si
  JOIN public.stock_movements sm ON sm.stock_item_id = si.id
  WHERE si.mapped_raw_material_id = p_material
    AND sm.reverses_posting_id IS NULL;
$$;

ALTER TABLE public.invoice_tax_snapshots ADD COLUMN IF NOT EXISTS cess numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bills ADD COLUMN source_invoice_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS bills_source_invoice_unique ON public.bills(source_invoice_id) WHERE source_invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bill_outstanding(p_bill uuid)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE found_bill uuid; original numeric; allocated numeric;
BEGIN
  SELECT id INTO found_bill FROM public.bills WHERE id = p_bill OR source_invoice_id = p_bill;
  IF found_bill IS NULL THEN
    SELECT total_amount INTO original FROM public.invoices WHERE id = p_bill;
    RETURN COALESCE(original, 0);
  END IF;
  SELECT original_amount INTO original FROM public.bills WHERE id = found_bill FOR UPDATE;
  SELECT COALESCE(sum(effect * amount), 0) INTO allocated FROM public.bill_allocations WHERE bill_id = found_bill;
  RETURN original - allocated;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_invoice_bill(p_invoice uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; inv record; voucher uuid; entry uuid; created uuid; party_ledger uuid;
BEGIN
  SELECT id INTO existing FROM public.bills WHERE source_invoice_id = p_invoice;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invoice missing'; END IF;
  SELECT id INTO party_ledger FROM public.ledger_accounts WHERE name = 'Debtors' LIMIT 1;
  IF party_ledger IS NULL THEN RAISE EXCEPTION 'Debtors ledger required'; END IF;
  INSERT INTO public.vouchers(voucher_number, voucher_type, voucher_date, source_table, source_id, narration, status)
  VALUES ('BILL-' || p_invoice::text, 'sales', COALESCE(inv.invoice_date, CURRENT_DATE), 'invoices', p_invoice, 'canonical invoice bill', 'posted')
  RETURNING id INTO voucher;
  INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order)
  VALUES (voucher, party_ledger, inv.total_amount, 0, 1)
  RETURNING id INTO entry;
  INSERT INTO public.bills(party_kind, party_id, ledger_account_id, bill_reference, bill_date, due_date, reference_type, original_amount, source_voucher_id, source_voucher_entry_id, external_ref, source_invoice_id)
  VALUES ('customer', inv.party_id, party_ledger, COALESCE(inv.invoice_number, p_invoice::text), COALESCE(inv.invoice_date, CURRENT_DATE), inv.due_date, 'new_ref', inv.total_amount, voucher, entry, 'invoice:' || p_invoice::text, p_invoice)
  RETURNING id INTO created;
  RETURN created;
END $$;

CREATE OR REPLACE FUNCTION public.record_invoice_receipt(p_invoice uuid, p_amount numeric, p_idempotency text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE existing uuid; bill uuid; due numeric; voucher uuid; entry uuid; cash uuid;
BEGIN
  SELECT id INTO existing FROM public.bill_allocations WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN public.bill_outstanding(p_invoice); END IF;
  bill := public.ensure_invoice_bill(p_invoice);
  PERFORM 1 FROM public.bills WHERE id = bill FOR UPDATE;
  due := public.bill_outstanding(bill);
  IF p_amount > due + 0.01 THEN RAISE EXCEPTION 'settlement exceeds outstanding'; END IF;
  SELECT id INTO cash FROM public.ledger_accounts WHERE name = 'Cash' LIMIT 1;
  IF cash IS NULL THEN RAISE EXCEPTION 'Cash ledger required'; END IF;
  INSERT INTO public.vouchers(voucher_number, voucher_type, voucher_date, narration, status)
  VALUES ('RCT-' || p_idempotency, 'receipt', CURRENT_DATE, 'canonical receipt', 'posted')
  RETURNING id INTO voucher;
  INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order)
  VALUES (voucher, cash, p_amount, 0, 1)
  RETURNING id INTO entry;
  INSERT INTO public.bill_allocations(bill_id, settlement_voucher_id, settlement_voucher_entry_id, allocation_type, allocation_date, amount, effect, idempotency_key)
  VALUES (bill, voucher, entry, 'against_ref', CURRENT_DATE, p_amount, 1, p_idempotency);
  PERFORM public.refresh_bill_status(bill);
  UPDATE public.invoices
  SET paid_amount = total_amount - public.bill_outstanding(bill),
      status = CASE WHEN public.bill_outstanding(bill) <= 0.01 THEN 'paid' ELSE 'partial' END
  WHERE id = p_invoice;
  RETURN public.bill_outstanding(bill);
END $$;

CREATE OR REPLACE FUNCTION public.post_note(p_invoice uuid, p_amount numeric, p_kind text, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; bill uuid; note uuid; voucher uuid; entry uuid; ledger uuid;
BEGIN
  SELECT id INTO existing FROM public.bill_allocations WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_kind NOT IN ('credit_note','debit_note') THEN RAISE EXCEPTION 'note kind invalid'; END IF;
  bill := public.ensure_invoice_bill(p_invoice);
  IF p_amount > public.bill_outstanding(bill) + 0.01 THEN RAISE EXCEPTION 'note exceeds outstanding'; END IF;
  SELECT id INTO ledger FROM public.ledger_accounts WHERE name = 'Sales' LIMIT 1;
  INSERT INTO public.vouchers(voucher_number, voucher_type, voucher_date, narration, status)
  VALUES ('NOTE-' || p_idempotency, p_kind::public.voucher_type, CURRENT_DATE, p_kind, 'posted')
  RETURNING id INTO voucher;
  INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order)
  VALUES (voucher, ledger, p_amount, 0, 1)
  RETURNING id INTO entry;
  INSERT INTO public.bill_allocations(bill_id, settlement_voucher_id, settlement_voucher_entry_id, allocation_type, allocation_date, amount, effect, idempotency_key)
  VALUES (bill, voucher, entry, 'against_ref', CURRENT_DATE, p_amount, 1, p_idempotency)
  RETURNING id INTO note;
  PERFORM public.refresh_bill_status(bill);
  RETURN note;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_invoice(p_invoice uuid, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; bill uuid; due numeric; rev uuid; voucher uuid; entry uuid; ledger uuid;
BEGIN
  SELECT id INTO existing FROM public.bill_allocations WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  bill := public.ensure_invoice_bill(p_invoice);
  due := public.bill_outstanding(bill);
  IF due > 0 THEN
    SELECT id INTO ledger FROM public.ledger_accounts WHERE name = 'Sales' LIMIT 1;
    INSERT INTO public.vouchers(voucher_number, voucher_type, voucher_date, narration, status)
    VALUES ('REV-' || p_idempotency, 'credit_note', CURRENT_DATE, 'invoice reversal', 'posted')
    RETURNING id INTO voucher;
    INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order)
    VALUES (voucher, ledger, due, 0, 1)
    RETURNING id INTO entry;
    INSERT INTO public.bill_allocations(bill_id, settlement_voucher_id, settlement_voucher_entry_id, allocation_type, allocation_date, amount, effect, idempotency_key)
    VALUES (bill, voucher, entry, 'against_ref', CURRENT_DATE, due, 1, p_idempotency)
    RETURNING id INTO rev;
  END IF;
  UPDATE public.bills SET status = 'cancelled' WHERE id = bill;
  UPDATE public.invoices SET status = 'cancelled' WHERE id = p_invoice;
  RETURN COALESCE(rev, bill);
END $$;

CREATE OR REPLACE FUNCTION public.post_stock_issue(
  p_item uuid, p_godown uuid, p_qty numeric, p_date date, p_idempotency text,
  p_source_table text DEFAULT NULL, p_source_id uuid DEFAULT NULL, p_movement_type text DEFAULT 'sale'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; posting uuid; avg numeric; amt numeric; allow_neg boolean;
BEGIN
  IF p_idempotency IS NOT NULL THEN
    SELECT id INTO existing FROM public.stock_postings WHERE idempotency_key = p_idempotency;
    IF existing IS NOT NULL THEN RETURN existing; END IF;
  END IF;
  PERFORM 1 FROM public.stock_items WHERE id = p_item FOR UPDATE;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'issue qty must be positive'; END IF;
  SELECT allow_negative_stock INTO allow_neg FROM public.stock_valuation_settings LIMIT 1;
  IF COALESCE(allow_neg, false) = false AND public.stock_available(p_item, p_godown) < p_qty THEN
    RAISE EXCEPTION 'negative stock blocked';
  END IF;
  avg := public.weighted_avg_rate(p_item, p_godown);
  amt := round(p_qty * avg, 2);
  IF amt = 0 THEN RAISE EXCEPTION 'zero-value issue rejected'; END IF;
  INSERT INTO public.stock_postings(idempotency_key, posting_type, source_table, source_id)
  VALUES (p_idempotency, 'issue', p_source_table, p_source_id) RETURNING id INTO posting;
  INSERT INTO public.stock_movements(movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, source_table, source_id, posting_id)
  VALUES (p_date, p_item, p_godown, p_movement_type, p_qty, avg, amt, p_source_table, p_source_id, posting);
  RETURN posting;
END $$;

CREATE TABLE IF NOT EXISTS public.tally_source_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  source_key text NOT NULL,
  reported_balance numeric NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, source_key)
);

CREATE OR REPLACE FUNCTION public.record_tally_balance(p_entity_type text, p_entity_id uuid, p_source_key text, p_reported numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.tally_source_balances(entity_type, entity_id, source_key, reported_balance)
  VALUES (p_entity_type, p_entity_id, p_source_key, p_reported)
  ON CONFLICT (entity_type, source_key) DO UPDATE
    SET reported_balance = EXCLUDED.reported_balance, entity_id = EXCLUDED.entity_id, imported_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.party_outstanding(p_party uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(public.bill_outstanding(i.id)), 0)
  FROM public.invoices i
  WHERE i.party_id = p_party AND i.status IS DISTINCT FROM 'cancelled';
$$;
