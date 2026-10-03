-- ISOLATED. Do not apply to production. Does not update existing stock or invoice rows.
-- Stops new sales-order inserts from writing raw_materials.current_stock.
-- Historical current_stock is left unchanged.

CREATE OR REPLACE FUNCTION public.apply_sales_stock_out()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public._apply_raw_delta(p_item uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- current_stock is no longer a stock truth. Movements are canonical.
  RETURN;
END $$;

CREATE TABLE IF NOT EXISTS public.bill_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_kind text NOT NULL CHECK (bill_kind IN ('customer','supplier')),
  bill_id uuid NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  allocation_type text NOT NULL CHECK (allocation_type IN ('against_ref','advance','debit_note','credit_note','reversal')),
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.bill_outstanding(p_bill uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(i.total_amount, 0) - COALESCE((
    SELECT sum(CASE WHEN allocation_type = 'reversal' THEN -amount ELSE amount END)
    FROM public.bill_settlements WHERE bill_id = p_bill AND allocation_type <> 'advance'
  ), 0)
  FROM public.invoices i WHERE i.id = p_bill;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_receipt(p_invoice uuid, p_amount numeric, p_idempotency text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE existing uuid; due numeric;
BEGIN
  SELECT id INTO existing FROM public.bill_settlements WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN public.bill_outstanding(p_invoice); END IF;
  due := public.bill_outstanding(p_invoice);
  IF p_amount > due + 0.01 THEN RAISE EXCEPTION 'settlement exceeds outstanding'; END IF;
  INSERT INTO public.bill_settlements(bill_kind, bill_id, amount, allocation_type, idempotency_key)
  VALUES ('customer', p_invoice, p_amount, 'against_ref', p_idempotency);
  UPDATE public.invoices
  SET paid_amount = total_amount - public.bill_outstanding(p_invoice),
      status = CASE WHEN public.bill_outstanding(p_invoice) <= 0.01 THEN 'paid' ELSE 'partial' END
  WHERE id = p_invoice;
  RETURN public.bill_outstanding(p_invoice);
END $$;

CREATE OR REPLACE FUNCTION public.post_note(p_invoice uuid, p_amount numeric, p_kind text, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; note uuid; inv record; tax numeric;
BEGIN
  SELECT id INTO existing FROM public.bill_settlements WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_kind NOT IN ('credit_note','debit_note') THEN RAISE EXCEPTION 'note kind invalid'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice;
  tax := round(p_amount * COALESCE(inv.tax_amount, 0) / NULLIF(inv.total_amount, 0), 2);
  INSERT INTO public.bill_settlements(bill_kind, bill_id, amount, allocation_type, idempotency_key)
  VALUES ('customer', p_invoice, p_amount, p_kind, p_idempotency) RETURNING id INTO note;
  INSERT INTO public.invoice_tax_snapshots(invoice_id, taxable_value, igst, cgst, sgst)
  VALUES (p_invoice, p_amount - tax, tax, 0, 0)
  ON CONFLICT (invoice_id) DO NOTHING;
  RETURN note;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_invoice(p_invoice uuid, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; due numeric; rev uuid;
BEGIN
  SELECT id INTO existing FROM public.bill_settlements WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  due := public.bill_outstanding(p_invoice);
  INSERT INTO public.bill_settlements(bill_kind, bill_id, amount, allocation_type, idempotency_key)
  VALUES ('customer', p_invoice, GREATEST(due, 0.01), 'reversal', p_idempotency) RETURNING id INTO rev;
  UPDATE public.invoices SET status = 'cancelled' WHERE id = p_invoice;
  RETURN rev;
END $$;

CREATE OR REPLACE FUNCTION public.post_gst_invoice(
  p_invoice uuid, p_sales uuid, p_party uuid, p_output_cgst uuid, p_output_sgst uuid, p_output_igst uuid, p_cess_ledger uuid, p_cess_amount numeric DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE inv record; inter boolean; cgst numeric; sgst numeric; igst numeric; existing uuid;
BEGIN
  SELECT id INTO existing FROM public.vouchers WHERE source_table = 'invoices' AND source_id = p_invoice;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice;
  inter := inv.dispatch_state_code IS DISTINCT FROM left(COALESCE(inv.supplier_gstin, ''), 2);
  igst := CASE WHEN inter THEN COALESCE(inv.tax_amount, 0) ELSE 0 END;
  cgst := CASE WHEN inter THEN 0 ELSE round(COALESCE(inv.tax_amount, 0) / 2, 2) END;
  sgst := CASE WHEN inter THEN 0 ELSE COALESCE(inv.tax_amount, 0) - cgst END;
  INSERT INTO public.invoice_tax_snapshots(invoice_id, taxable_value, igst, cgst, sgst)
  VALUES (p_invoice, COALESCE(inv.subtotal, 0), igst, cgst, sgst)
  ON CONFLICT (invoice_id) DO NOTHING;
  INSERT INTO public.vouchers(voucher_number, voucher_type, voucher_date, source_table, source_id, narration)
  VALUES ('GST-' || p_invoice::text, 'sales', inv.invoice_date, 'invoices', p_invoice, 'gst snapshot') RETURNING id INTO existing;
  INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order) VALUES
    (existing, p_party, inv.total_amount + p_cess_amount, 0, 1),
    (existing, p_sales, 0, inv.subtotal, 2);
  IF igst > 0 THEN INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order) VALUES (existing, p_output_igst, 0, igst, 3); END IF;
  IF cgst > 0 THEN INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order) VALUES (existing, p_output_cgst, 0, cgst, 4); END IF;
  IF sgst > 0 THEN INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order) VALUES (existing, p_output_sgst, 0, sgst, 5); END IF;
  IF p_cess_amount > 0 THEN INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order) VALUES (existing, p_cess_ledger, 0, p_cess_amount, 6); END IF;
  RETURN existing;
END $$;

CREATE TABLE IF NOT EXISTS public.cost_centre_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_entry_id uuid NOT NULL,
  cost_center_id uuid NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0)
);

CREATE OR REPLACE FUNCTION public.allocate_cost_centres(p_entry uuid, p_allocations jsonb)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE line record; allocated numeric; n int;
BEGIN
  SELECT debit + credit AS amount INTO line FROM public.voucher_entries WHERE id = p_entry;
  SELECT COALESCE(sum((a->>'amount')::numeric), 0) INTO allocated FROM jsonb_array_elements(p_allocations) a;
  IF allocated <> line.amount THEN RAISE EXCEPTION 'cost-centre allocations must equal the line'; END IF;
  INSERT INTO public.cost_centre_allocations(voucher_entry_id, cost_center_id, amount)
  SELECT p_entry, (a->>'cost_center_id')::uuid, (a->>'amount')::numeric FROM jsonb_array_elements(p_allocations) a;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.match_bank_lines(p_book uuid, p_statement uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE book record; stmt record;
BEGIN
  SELECT * INTO book FROM public.bank_transactions WHERE id = p_book FOR UPDATE;
  SELECT * INTO stmt FROM public.bank_transactions WHERE id = p_statement FOR UPDATE;
  IF book.reconciled_at IS NOT NULL OR stmt.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'already reconciled'; END IF;
  IF book.source = stmt.source THEN RAISE EXCEPTION 'match book to statement'; END IF;
  IF book.debit <> stmt.debit OR book.credit <> stmt.credit THEN RAISE EXCEPTION 'amounts do not match'; END IF;
  UPDATE public.bank_transactions SET reconciled_at = now(), reconciled_with = p_statement WHERE id = p_book;
  UPDATE public.bank_transactions SET reconciled_at = now(), reconciled_with = p_book WHERE id = p_statement;
END $$;

CREATE OR REPLACE FUNCTION public.ledger_balance_as_of(p_ledger uuid, p_as_of date)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(e.debit - e.credit), 0)
  FROM public.voucher_entries e
  JOIN public.vouchers v ON v.id = e.voucher_id
  WHERE e.ledger_account_id = p_ledger AND v.voucher_date <= p_as_of;
$$;

CREATE OR REPLACE FUNCTION public.reserve_sales_order(p_order uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE line record; item uuid; godown uuid; n int := 0; need numeric;
BEGIN
  SELECT id INTO godown FROM public.godowns WHERE is_active ORDER BY created_at LIMIT 1;
  FOR line IN
    SELECT soi.id, soi.quantity, b.raw_material_id, b.quantity_per_unit
    FROM public.sales_order_items soi
    JOIN public.model_boq b ON b.model_id = soi.model_id
    WHERE soi.sales_order_id = p_order
  LOOP
    SELECT id INTO item FROM public.stock_items WHERE mapped_raw_material_id = line.raw_material_id LIMIT 1;
    IF item IS NULL THEN CONTINUE; END IF;
    need := round(line.quantity_per_unit * line.quantity, 4);
    PERFORM public.reserve_stock(item, godown, need, 'sales_orders', p_order, 'reserve:' || p_order::text || ':' || line.id::text || ':' || item::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.produce_sales_order_bom(p_order uuid, p_godown uuid, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; line record; component jsonb := '[]'::jsonb; fg uuid; qty numeric := 0; raw_item uuid; need numeric;
BEGIN
  SELECT id INTO existing FROM public.stock_postings WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_godown IS NULL THEN
    SELECT id INTO p_godown FROM public.godowns WHERE is_active ORDER BY created_at LIMIT 1;
  END IF;
  UPDATE public.stock_reservations SET status = 'consumed' WHERE source_table = 'sales_orders' AND source_id = p_order AND status = 'open';
  FOR line IN
    SELECT soi.model_id, soi.quantity, b.raw_material_id, b.quantity_per_unit
    FROM public.sales_order_items soi
    JOIN public.model_boq b ON b.model_id = soi.model_id
    WHERE soi.sales_order_id = p_order
  LOOP
    SELECT id INTO raw_item FROM public.stock_items WHERE mapped_raw_material_id = line.raw_material_id LIMIT 1;
    IF raw_item IS NULL THEN RAISE EXCEPTION 'raw material is not mapped to a stock item'; END IF;
    need := round(line.quantity_per_unit * line.quantity, 4);
    component := component || jsonb_build_array(jsonb_build_object('item_id', raw_item, 'qty', need));
    IF fg IS NULL THEN
      SELECT id INTO fg FROM public.stock_items WHERE mapped_model_id = line.model_id LIMIT 1;
      qty := line.quantity;
    END IF;
  END LOOP;
  IF fg IS NULL THEN RAISE EXCEPTION 'finished good is not mapped'; END IF;
  RETURN public.post_production_stock(fg, qty, p_godown, CURRENT_DATE, p_idempotency, component);
END $$;
