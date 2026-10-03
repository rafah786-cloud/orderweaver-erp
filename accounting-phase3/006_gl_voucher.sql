-- NOT INSTALLED. New postings only. Does not update existing voucher rows.

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
