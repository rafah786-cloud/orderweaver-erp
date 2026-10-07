BEGIN;

CREATE OR REPLACE FUNCTION public.validate_voucher_financial_year()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  matched_id uuid;
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Voucher company is required';
  END IF;

  IF NEW.financial_year_id IS NULL THEN
    SELECT fy.id
    INTO matched_id
    FROM public.financial_years fy
    WHERE fy.company_id = NEW.company_id
      AND NEW.voucher_date BETWEEN fy.start_date AND fy.end_date
    ORDER BY fy.start_date DESC
    LIMIT 1;

    IF matched_id IS NULL THEN
      RAISE EXCEPTION 'No financial year covers voucher date % for company %',
        NEW.voucher_date, NEW.company_id;
    END IF;

    NEW.financial_year_id := matched_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.financial_years fy
      WHERE fy.id = NEW.financial_year_id
        AND fy.company_id = NEW.company_id
        AND NEW.voucher_date BETWEEN fy.start_date AND fy.end_date
    ) THEN
      RAISE EXCEPTION 'Voucher financial year does not match company and voucher date';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_voucher_financial_year
  ON public.vouchers;

CREATE TRIGGER trg_validate_voucher_financial_year
  BEFORE INSERT OR UPDATE OF company_id, voucher_date, financial_year_id
  ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_voucher_financial_year();

REVOKE ALL ON FUNCTION public.validate_voucher_financial_year() FROM PUBLIC, anon, authenticated;

COMMIT;
