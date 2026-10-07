BEGIN;

CREATE OR REPLACE FUNCTION public.match_bank_lines(
  p_book uuid,
  p_statement uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  book public.bank_transactions%ROWTYPE;
  stmt public.bank_transactions%ROWTYPE;
BEGIN
  v_company := public.current_company_id();

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_company IS NULL OR NOT public.has_company_access(v_company) THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;

  IF NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
  ) THEN
    RAISE EXCEPTION 'Bank reconciliation access required';
  END IF;

  IF p_book IS NULL OR p_statement IS NULL OR p_book = p_statement THEN
    RAISE EXCEPTION 'Two distinct bank transaction lines are required';
  END IF;

  SELECT *
  INTO book
  FROM public.bank_transactions
  WHERE id = p_book
    AND company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Book transaction not found in active company';
  END IF;

  SELECT *
  INTO stmt
  FROM public.bank_transactions
  WHERE id = p_statement
    AND company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Statement transaction not found in active company';
  END IF;

  IF book.bank_account_id IS DISTINCT FROM stmt.bank_account_id THEN
    RAISE EXCEPTION 'Transactions must belong to the same bank account';
  END IF;

  IF book.reconciled_at IS NOT NULL OR stmt.reconciled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already reconciled';
  END IF;

  IF book.source = stmt.source THEN
    RAISE EXCEPTION 'Match one book line to one statement line';
  END IF;

  IF book.debit <> stmt.debit OR book.credit <> stmt.credit THEN
    RAISE EXCEPTION 'Amounts do not match';
  END IF;

  UPDATE public.bank_transactions
  SET reconciled_at = clock_timestamp(),
      reconciled_with = p_statement
  WHERE id = p_book
    AND company_id = v_company;

  UPDATE public.bank_transactions
  SET reconciled_at = clock_timestamp(),
      reconciled_with = p_book
  WHERE id = p_statement
    AND company_id = v_company;
END;
$$;

REVOKE ALL ON FUNCTION public.match_bank_lines(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_bank_lines(uuid,uuid) TO authenticated;

COMMIT;
