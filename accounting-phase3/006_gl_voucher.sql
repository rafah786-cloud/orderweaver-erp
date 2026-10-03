-- Not applied. Compatible with the live voucher table.
-- Does not update the existing 7 vouchers, 330 bills, or stock.

CREATE OR REPLACE FUNCTION public.create_gl_voucher(
  _type text,
  _date date,
  _entries jsonb,
  _narration text,
  _reference text,
  _idempotency_key text,
  _status text DEFAULT 'posted'
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  existing uuid;
  voucher uuid;
  next_no integer;
  prefix text;
  width integer;
  suffix text;
  debit numeric := 0;
  credit numeric := 0;
  line jsonb;
BEGIN
  SELECT id INTO existing
  FROM public.vouchers
  WHERE reference = _idempotency_key
  LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(_entries)
  LOOP
    debit := debit + COALESCE((line->>'debit')::numeric, 0);
    credit := credit + COALESCE((line->>'credit')::numeric, 0);
  END LOOP;
  IF round(debit - credit, 2) <> 0 OR debit <= 0 THEN
    RAISE EXCEPTION 'unbalanced voucher';
  END IF;

  UPDATE public.voucher_number_series
  SET next_number = next_number + 1
  WHERE voucher_type = _type::public.voucher_type
  RETURNING next_number - 1, prefix, width, suffix INTO next_no, prefix, width, suffix;
  IF next_no IS NULL THEN RAISE EXCEPTION 'voucher series missing'; END IF;

  INSERT INTO public.vouchers (
    voucher_type, voucher_date, voucher_number, narration, reference, is_locked, source_table
  ) VALUES (
    _type::public.voucher_type, _date,
    prefix || lpad(next_no::text, width, '0') || suffix,
    _narration, _idempotency_key, true, NULL
  ) RETURNING id INTO voucher;

  INSERT INTO public.voucher_entries (voucher_id, ledger_account_id, debit, credit, line_order)
  SELECT voucher, (line->>'ledger_account_id')::uuid,
         COALESCE((line->>'debit')::numeric, 0), COALESCE((line->>'credit')::numeric, 0),
         ordinality::integer
  FROM jsonb_array_elements(_entries) WITH ORDINALITY AS t(line, ordinality);
  RETURN voucher;
END $$;
