-- Additive only. Does not rewrite existing vouchers, bills, invoices, or opening stock rates.

ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.purchase_bills
  DROP CONSTRAINT IF EXISTS purchase_bills_receipt_status_check;
ALTER TABLE public.purchase_bills
  ADD CONSTRAINT purchase_bills_receipt_status_check
  CHECK (receipt_status IN ('draft', 'received', 'cancelled'));

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_fulfillment_status_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_fulfillment_status_check
  CHECK (fulfillment_status IN ('draft', 'confirmed', 'dispatched', 'cancelled'));

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cgst_amount numeric,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric,
  ADD COLUMN IF NOT EXISTS igst_amount numeric;

DO $$
BEGIN
  IF EXISTS (
    SELECT mapped_raw_material_id FROM public.stock_items
    WHERE mapped_raw_material_id IS NOT NULL
    GROUP BY mapped_raw_material_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ambiguous raw-material stock mapping; unique index not created';
  END IF;
  IF EXISTS (
    SELECT mapped_model_id FROM public.stock_items
    WHERE mapped_model_id IS NOT NULL
    GROUP BY mapped_model_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ambiguous model stock mapping; unique index not created';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS stock_items_one_raw_material
  ON public.stock_items (mapped_raw_material_id)
  WHERE mapped_raw_material_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_one_model
  ON public.stock_items (mapped_model_id)
  WHERE mapped_model_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reject_opening_revaluation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.movement_type = 'opening' AND (NEW.rate IS DISTINCT FROM OLD.rate OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.quantity IS DISTINCT FROM OLD.quantity) THEN
    RAISE EXCEPTION 'opening stock valuation cannot be assigned here';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stock_opening_immutable ON public.stock_movements;
CREATE TRIGGER stock_opening_immutable
  BEFORE UPDATE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.reject_opening_revaluation();
-- Installed by 20261004183000. Existing voucher rows are not updated.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS vouchers_idempotency_key_unique
  ON public.vouchers (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_gl_voucher(
  _type text,
  _date date,
  _entries jsonb,
  _narration text,
  _reference text,
  _idempotency_key text
) RETURNS TABLE(id uuid, voucher_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
  existing_number text;
  voucher_id uuid;
  voucher_no text;
  next_no integer;
  prefix text;
  width integer;
  suffix text;
  year_id uuid;
  line jsonb;
  debit numeric := 0;
  credit numeric := 0;
  line_count integer := 0;
  ledger_id uuid;
  ledger_active boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'admin or accountant required';
  END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'idempotency key required';
  END IF;

  SELECT v.id, v.voucher_number INTO existing_id, existing_number
  FROM public.vouchers v
  WHERE v.idempotency_key = _idempotency_key;
  IF existing_id IS NOT NULL THEN
    id := existing_id;
    voucher_number := existing_number;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT fy.id INTO year_id
  FROM public.financial_years fy
  WHERE _date BETWEEN fy.start_date AND fy.end_date
    AND fy.is_locked = false
  ORDER BY fy.is_current DESC
  LIMIT 1;
  IF year_id IS NULL THEN RAISE EXCEPTION 'closed or missing financial year'; END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(_entries) LOOP
    line_count := line_count + 1;
    ledger_id := (line->>'ledger_account_id')::uuid;
    SELECT is_active INTO ledger_active FROM public.ledger_accounts WHERE ledger_accounts.id = ledger_id;
    IF ledger_active IS NULL THEN RAISE EXCEPTION 'invalid ledger'; END IF;
    IF ledger_active = false THEN RAISE EXCEPTION 'inactive ledger'; END IF;
    IF COALESCE((line->>'debit')::numeric, 0) < 0 OR COALESCE((line->>'credit')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'invalid amount';
    END IF;
    IF (COALESCE((line->>'debit')::numeric, 0) > 0) = (COALESCE((line->>'credit')::numeric, 0) > 0) THEN
      RAISE EXCEPTION 'entry must have one side';
    END IF;
    debit := debit + COALESCE((line->>'debit')::numeric, 0);
    credit := credit + COALESCE((line->>'credit')::numeric, 0);
  END LOOP;
  IF line_count < 2 THEN RAISE EXCEPTION 'at least two entries required'; END IF;
  IF round(debit - credit, 2) <> 0 OR debit <= 0 THEN RAISE EXCEPTION 'unbalanced voucher'; END IF;

  SELECT s.next_number, s.prefix, s.width, s.suffix
  INTO next_no, prefix, width, suffix
  FROM public.voucher_number_series s
  WHERE s.voucher_type = _type::public.voucher_type
  FOR UPDATE;
  IF next_no IS NULL THEN RAISE EXCEPTION 'voucher series missing'; END IF;
  UPDATE public.voucher_number_series
  SET next_number = next_number + 1
  WHERE voucher_type = _type::public.voucher_type;
  voucher_no := prefix || lpad(next_no::text, width, '0') || suffix;

  INSERT INTO public.vouchers (
    voucher_type, voucher_date, voucher_number, narration, reference,
    is_locked, financial_year_id, idempotency_key
  ) VALUES (
    _type::public.voucher_type, _date, voucher_no, _narration, _reference,
    true, year_id, _idempotency_key
  ) RETURNING vouchers.id INTO voucher_id;

  INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, debit, credit, line_order)
  SELECT voucher_id, (line->>'ledger_account_id')::uuid,
         COALESCE((line->>'debit')::numeric, 0), COALESCE((line->>'credit')::numeric, 0),
         ordinality::integer
  FROM jsonb_array_elements(_entries) WITH ORDINALITY AS t(line, ordinality);

  id := voucher_id;
  voucher_number := voucher_no;
  RETURN NEXT;
END $$;
