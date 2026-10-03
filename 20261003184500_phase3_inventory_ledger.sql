-- ISOLATED until applied by you. Additive only: does not update or delete existing stock rows.
-- Canonical quantity for new posts is stock_movements. raw_materials.current_stock is a delta projection only.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS posting_id uuid,
  ADD COLUMN IF NOT EXISTS reverses_posting_id uuid;

CREATE TABLE IF NOT EXISTS public.stock_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE,
  posting_type text NOT NULL,
  source_table text,
  source_id uuid,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  reversed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
  godown_id uuid REFERENCES public.godowns(id),
  qty numeric NOT NULL CHECK (qty > 0),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','released','consumed')),
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_tax_snapshots (
  invoice_id uuid PRIMARY KEY,
  taxable_value numeric NOT NULL,
  igst numeric NOT NULL DEFAULT 0,
  cgst numeric NOT NULL DEFAULT 0,
  sgst numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tally_ingest_events (
  idempotency_key text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.stock_on_hand(p_item uuid, p_godown uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(
    CASE
      WHEN movement_type IN ('purchase','production_in','transfer_in','opening') THEN quantity
      WHEN movement_type IN ('sale','production_out','transfer_out') THEN -abs(quantity)
      ELSE quantity
    END
  ), 0)
  FROM public.stock_movements
  WHERE stock_item_id = p_item
    AND (p_godown IS NULL OR godown_id IS NOT DISTINCT FROM p_godown)
    AND reverses_posting_id IS NULL
    AND (posting_id IS NULL OR posting_id NOT IN (SELECT reversed_by FROM public.stock_postings WHERE reversed_by IS NOT NULL));
$$;

CREATE OR REPLACE FUNCTION public.stock_available(p_item uuid, p_godown uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT public.stock_on_hand(p_item, p_godown) - COALESCE((
    SELECT sum(qty) FROM public.stock_reservations
    WHERE stock_item_id = p_item AND status = 'open'
      AND (p_godown IS NULL OR godown_id IS NOT DISTINCT FROM p_godown)
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.weighted_avg_rate(p_item uuid, p_godown uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE qty numeric; val numeric;
BEGIN
  SELECT COALESCE(sum(CASE WHEN movement_type IN ('purchase','production_in','transfer_in','opening') THEN quantity
                           WHEN movement_type IN ('sale','production_out','transfer_out') THEN -abs(quantity)
                           ELSE quantity END), 0),
         COALESCE(sum(CASE WHEN movement_type IN ('purchase','production_in','transfer_in','opening') THEN amount
                           WHEN movement_type IN ('sale','production_out','transfer_out') THEN -abs(amount)
                           ELSE amount END), 0)
  INTO qty, val
  FROM public.stock_movements
  WHERE stock_item_id = p_item
    AND (p_godown IS NULL OR godown_id IS NOT DISTINCT FROM p_godown)
    AND reverses_posting_id IS NULL;
  IF qty = 0 THEN RETURN 0; END IF;
  RETURN round(val / qty, 6);
END;
$$;

CREATE OR REPLACE FUNCTION public._apply_raw_delta(p_item uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE raw uuid;
BEGIN
  SELECT mapped_raw_material_id INTO raw FROM public.stock_items WHERE id = p_item;
  IF raw IS NOT NULL THEN
    UPDATE public.raw_materials SET current_stock = current_stock + p_qty WHERE id = raw;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_stock_receipt(
  p_item uuid, p_godown uuid, p_qty numeric, p_rate numeric,
  p_date date, p_idempotency text, p_source_table text DEFAULT NULL, p_source_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; posting uuid; amt numeric;
BEGIN
  IF p_idempotency IS NOT NULL THEN
    SELECT id INTO existing FROM public.stock_postings WHERE idempotency_key = p_idempotency;
    IF existing IS NOT NULL THEN RETURN existing; END IF;
  END IF;
  IF p_qty <= 0 OR p_rate <= 0 THEN RAISE EXCEPTION 'zero-value receipt rejected'; END IF;
  amt := round(p_qty * p_rate, 2);
  INSERT INTO public.stock_postings(idempotency_key, posting_type, source_table, source_id)
  VALUES (p_idempotency, 'receipt', p_source_table, p_source_id) RETURNING id INTO posting;
  INSERT INTO public.stock_movements(movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, source_table, source_id, posting_id)
  VALUES (p_date, p_item, p_godown, 'purchase', p_qty, p_rate, amt, p_source_table, p_source_id, posting);
  PERFORM public._apply_raw_delta(p_item, p_qty);
  RETURN posting;
END;
$$;

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
  PERFORM public._apply_raw_delta(p_item, -p_qty);
  RETURN posting;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_item uuid, p_godown uuid, p_qty numeric, p_source_table text, p_source_id uuid, p_idempotency text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; res uuid;
BEGIN
  SELECT id INTO existing FROM public.stock_reservations WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF public.stock_available(p_item, p_godown) < p_qty THEN RAISE EXCEPTION 'insufficient available stock to reserve'; END IF;
  INSERT INTO public.stock_reservations(stock_item_id, godown_id, qty, source_table, source_id, idempotency_key)
  VALUES (p_item, p_godown, p_qty, p_source_table, p_source_id, p_idempotency) RETURNING id INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_stock_transfer(
  p_item uuid, p_from uuid, p_to uuid, p_qty numeric, p_date date, p_idempotency text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; posting uuid; avg numeric; amt numeric;
BEGIN
  SELECT id INTO existing FROM public.stock_postings WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'transfer godowns must differ'; END IF;
  IF public.stock_available(p_item, p_from) < p_qty THEN RAISE EXCEPTION 'negative stock blocked'; END IF;
  avg := public.weighted_avg_rate(p_item, p_from);
  amt := round(p_qty * avg, 2);
  IF amt = 0 THEN RAISE EXCEPTION 'zero-value transfer rejected'; END IF;
  INSERT INTO public.stock_postings(idempotency_key, posting_type) VALUES (p_idempotency, 'transfer') RETURNING id INTO posting;
  INSERT INTO public.stock_movements(movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, posting_id)
  VALUES
    (p_date, p_item, p_from, 'transfer_out', p_qty, avg, amt, posting),
    (p_date, p_item, p_to, 'transfer_in', p_qty, avg, amt, posting);
  RETURN posting;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_production_stock(
  p_fg uuid, p_fg_qty numeric, p_godown uuid, p_date date, p_idempotency text, p_components jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; posting uuid; comp jsonb; need numeric; avg numeric; amt numeric; total numeric := 0; fg_rate numeric;
BEGIN
  SELECT id INTO existing FROM public.stock_postings WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  INSERT INTO public.stock_postings(idempotency_key, posting_type) VALUES (p_idempotency, 'production') RETURNING id INTO posting;
  FOR comp IN SELECT * FROM jsonb_array_elements(p_components) LOOP
    need := (comp->>'qty')::numeric;
    IF public.stock_available((comp->>'item_id')::uuid, p_godown) < need THEN RAISE EXCEPTION 'negative stock blocked'; END IF;
    avg := public.weighted_avg_rate((comp->>'item_id')::uuid, p_godown);
    amt := round(need * avg, 2);
    IF amt = 0 THEN RAISE EXCEPTION 'zero-value production issue rejected'; END IF;
    INSERT INTO public.stock_movements(movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, posting_id)
    VALUES (p_date, (comp->>'item_id')::uuid, p_godown, 'production_out', need, avg, amt, posting);
    PERFORM public._apply_raw_delta((comp->>'item_id')::uuid, -need);
    total := total + amt;
  END LOOP;
  fg_rate := round(total / p_fg_qty, 6);
  INSERT INTO public.stock_movements(movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, posting_id)
  VALUES (p_date, p_fg, p_godown, 'production_in', p_fg_qty, fg_rate, total, posting);
  RETURN posting;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_stock_posting(p_posting uuid, p_reason text, p_date date, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; rev uuid; mv record;
BEGIN
  SELECT id INTO existing FROM public.stock_postings WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_postings WHERE id = p_posting AND status = 'posted') THEN
    RAISE EXCEPTION 'only a posted document can be reversed';
  END IF;
  INSERT INTO public.stock_postings(idempotency_key, posting_type, status) VALUES (p_idempotency, 'reversal', 'posted') RETURNING id INTO rev;
  FOR mv IN SELECT * FROM public.stock_movements WHERE posting_id = p_posting LOOP
    INSERT INTO public.stock_movements(movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, posting_id, reverses_posting_id, narration)
    VALUES (p_date, mv.stock_item_id, mv.godown_id,
      CASE WHEN mv.movement_type IN ('purchase','production_in','transfer_in','opening') THEN 'adjustment' ELSE 'adjustment' END,
      CASE WHEN mv.movement_type IN ('purchase','production_in','transfer_in','opening') THEN -mv.quantity ELSE mv.quantity END,
      mv.rate, mv.amount, rev, p_posting, p_reason);
    PERFORM public._apply_raw_delta(mv.stock_item_id,
      CASE WHEN mv.movement_type IN ('purchase','production_in','transfer_in','opening') THEN -mv.quantity ELSE mv.quantity END);
  END LOOP;
  UPDATE public.stock_postings SET status = 'reversed', reversed_by = rev WHERE id = p_posting;
  RETURN rev;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_bill(p_bill uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE line record; item uuid; godown uuid; posting uuid; key text := 'purchase:' || p_bill::text;
BEGIN
  SELECT id INTO posting FROM public.stock_postings WHERE idempotency_key = key;
  IF posting IS NOT NULL THEN RETURN posting; END IF;
  SELECT id INTO godown FROM public.godowns WHERE is_active ORDER BY created_at LIMIT 1;
  FOR line IN SELECT * FROM public.purchase_bill_items WHERE purchase_bill_id = p_bill LOOP
    SELECT id INTO item FROM public.stock_items WHERE mapped_raw_material_id = line.raw_material_id LIMIT 1;
    IF item IS NULL THEN
      INSERT INTO public.stock_items(name, unit, mapped_raw_material_id)
      SELECT name, unit, id FROM public.raw_materials WHERE id = line.raw_material_id
      RETURNING id INTO item;
    END IF;
    posting := public.post_stock_receipt(item, godown, line.quantity, line.unit_price, CURRENT_DATE, key || ':' || line.id::text, 'purchase_bills', p_bill);
  END LOOP;
  RETURN posting;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_sales_order(p_order uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE line record; item uuid; godown uuid; n int := 0;
BEGIN
  SELECT id INTO godown FROM public.godowns WHERE is_active ORDER BY created_at LIMIT 1;
  FOR line IN SELECT * FROM public.sales_order_items WHERE sales_order_id = p_order LOOP
    SELECT id INTO item FROM public.stock_items WHERE mapped_model_id = line.model_id LIMIT 1;
    IF item IS NULL THEN CONTINUE; END IF;
    PERFORM public.reserve_stock(item, godown, line.quantity, 'sales_orders', p_order, 'reserve:' || p_order::text || ':' || line.id::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_sales_order(p_order uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE line record; item uuid; godown uuid; n int := 0; res record;
BEGIN
  SELECT id INTO godown FROM public.godowns WHERE is_active ORDER BY created_at LIMIT 1;
  FOR line IN SELECT * FROM public.sales_order_items WHERE sales_order_id = p_order LOOP
    SELECT id INTO item FROM public.stock_items WHERE mapped_model_id = line.model_id LIMIT 1;
    IF item IS NULL THEN CONTINUE; END IF;
    PERFORM public.post_stock_issue(item, godown, line.quantity, CURRENT_DATE, 'dispatch:' || p_order::text || ':' || line.id::text, 'sales_orders', p_order, 'sale');
    UPDATE public.stock_reservations SET status = 'consumed'
    WHERE source_table = 'sales_orders' AND source_id = p_order AND stock_item_id = item AND status = 'open';
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_balanced_voucher(
  p_type text, p_number text, p_date date, p_debit uuid, p_credit uuid, p_amount numeric, p_source text, p_source_id uuid, p_narration text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; vid uuid;
BEGIN
  SELECT id INTO existing FROM public.vouchers WHERE source_table = p_source AND source_id = p_source_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_amount <= 0 OR p_debit = p_credit THEN RAISE EXCEPTION 'unbalanced voucher rejected'; END IF;
  INSERT INTO public.vouchers(voucher_number, voucher_type, voucher_date, narration, source_table, source_id)
  VALUES (p_number, p_type::public.voucher_type, p_date, p_narration, p_source, p_source_id) RETURNING id INTO vid;
  INSERT INTO public.voucher_entries(voucher_id, ledger_account_id, debit, credit, line_order)
  VALUES (vid, p_debit, p_amount, 0, 1), (vid, p_credit, 0, p_amount, 2);
  RETURN vid;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_invoice_tax(p_invoice uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE inv record; inter boolean; tax numeric;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice missing'; END IF;
  tax := COALESCE(inv.tax_amount, 0);
  inter := inv.dispatch_state_code IS DISTINCT FROM left(COALESCE(inv.supplier_gstin, ''), 2);
  INSERT INTO public.invoice_tax_snapshots(invoice_id, taxable_value, igst, cgst, sgst)
  VALUES (p_invoice, COALESCE(inv.subtotal, 0), CASE WHEN inter THEN tax ELSE 0 END, CASE WHEN inter THEN 0 ELSE round(tax / 2, 2) END, CASE WHEN inter THEN 0 ELSE tax - round(tax / 2, 2) END)
  ON CONFLICT (invoice_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_tally_event(p_key text, p_entity_type text, p_entity_key text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.tally_ingest_events(idempotency_key, entity_type, entity_key) VALUES (p_key, p_entity_type, p_entity_key);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;
