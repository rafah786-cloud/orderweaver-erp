-- ISOLATED-ENVIRONMENT MIGRATION: do not apply to the shared live database.
-- Phase 1 is additive: existing vouchers are retained and classified as posted.

CREATE TYPE public.voucher_status AS ENUM ('draft', 'posted', 'cancelled', 'reversed');
CREATE TYPE public.financial_year_status AS ENUM ('open', 'closed');

ALTER TABLE public.vouchers
  ADD COLUMN status public.voucher_status NOT NULL DEFAULT 'posted',
  ADD COLUMN idempotency_key text,
  ADD COLUMN reversal_of uuid REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  ADD COLUMN reversed_by uuid REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  ADD COLUMN posted_at timestamptz,
  ADD COLUMN posted_by uuid,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by uuid,
  ADD COLUMN cancellation_reason text;

UPDATE public.vouchers
SET posted_at = COALESCE(posted_at, created_at), posted_by = COALESCE(posted_by, created_by)
WHERE status = 'posted';

CREATE UNIQUE INDEX vouchers_idempotency_key_unique
  ON public.vouchers(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX vouchers_one_reversal_unique
  ON public.vouchers(reversal_of) WHERE reversal_of IS NOT NULL;
CREATE INDEX vouchers_fy_status_date_idx ON public.vouchers(financial_year_id, status, voucher_date);

ALTER TABLE public.financial_years
  ADD COLUMN status public.financial_year_status NOT NULL DEFAULT 'open',
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid,
  ADD COLUMN reopened_at timestamptz,
  ADD COLUMN reopened_by uuid,
  ADD COLUMN reopen_reason text;

UPDATE public.financial_years
SET status = CASE WHEN is_locked THEN 'closed'::public.financial_year_status ELSE 'open'::public.financial_year_status END;

CREATE UNIQUE INDEX financial_years_one_current_unique ON public.financial_years(is_current) WHERE is_current;

CREATE TABLE public.financial_year_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES public.financial_years(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('closed', 'reopened')),
  reason text,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.financial_year_events TO authenticated;
GRANT ALL ON public.financial_year_events TO service_role;
ALTER TABLE public.financial_year_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial year events read" ON public.financial_year_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));
CREATE INDEX financial_year_events_year_idx ON public.financial_year_events(financial_year_id, performed_at DESC);

CREATE OR REPLACE FUNCTION public.validate_financial_year_dates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.end_date <= NEW.start_date THEN RAISE EXCEPTION 'Financial year end must follow start'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.financial_years fy WHERE fy.id <> NEW.id
      AND daterange(fy.start_date, fy.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN RAISE EXCEPTION 'Financial year dates overlap an existing year'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_financial_year_dates BEFORE INSERT OR UPDATE OF start_date, end_date
  ON public.financial_years FOR EACH ROW EXECUTE FUNCTION public.validate_financial_year_dates();

CREATE OR REPLACE FUNCTION public.resolve_financial_year(_date date)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result uuid; matches integer;
BEGIN
  SELECT count(*), min(id) INTO matches, result FROM public.financial_years
  WHERE _date BETWEEN start_date AND end_date;
  IF matches = 0 THEN RAISE EXCEPTION 'No financial year is configured for %', _date; END IF;
  IF matches > 1 THEN RAISE EXCEPTION 'Multiple financial years contain %', _date; END IF;
  RETURN result;
END $$;

UPDATE public.vouchers v SET financial_year_id = fy.id
FROM public.financial_years fy
WHERE v.financial_year_id IS NULL AND v.voucher_date BETWEEN fy.start_date AND fy.end_date;

CREATE OR REPLACE FUNCTION public.next_voucher_number(_type public.voucher_type)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.voucher_number_series%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.voucher_number_series WHERE voucher_type = _type FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No number series for %', _type; END IF;
  UPDATE public.voucher_number_series SET next_number = next_number + 1, updated_at = now() WHERE id = s.id;
  RETURN s.prefix || lpad(s.next_number::text, s.width, '0') || s.suffix;
END $$;

CREATE OR REPLACE FUNCTION public.assert_accounting_role()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'accountant') THEN RAISE EXCEPTION 'Accounting access required'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_voucher(_voucher_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dr numeric; cr numeric; lines integer; invalid integer;
BEGIN
  SELECT count(*), COALESCE(sum(debit),0), COALESCE(sum(credit),0),
    count(*) FILTER (WHERE debit < 0 OR credit < 0 OR (debit > 0) = (credit > 0))
  INTO lines, dr, cr, invalid FROM public.voucher_entries WHERE voucher_id = _voucher_id;
  IF lines < 2 THEN RAISE EXCEPTION 'A posted voucher requires at least two lines'; END IF;
  IF invalid > 0 THEN RAISE EXCEPTION 'Each line requires exactly one positive debit or credit'; END IF;
  IF round(dr,2) <> round(cr,2) OR round(dr,2) <= 0 THEN
    RAISE EXCEPTION 'Voucher is not balanced: Dr=% Cr=%', dr, cr;
  END IF;
  IF EXISTS (SELECT 1 FROM public.voucher_entries ve JOIN public.ledger_accounts la ON la.id=ve.ledger_account_id
    WHERE ve.voucher_id=_voucher_id AND NOT la.is_active) THEN RAISE EXCEPTION 'Inactive ledger used'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_accounting_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE state public.voucher_status;
BEGIN
  IF current_setting('app.accounting_lifecycle', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME='vouchers' THEN state:=OLD.status;
  ELSE SELECT status INTO state FROM public.vouchers WHERE id=COALESCE(NEW.voucher_id,OLD.voucher_id); END IF;
  IF state IN ('posted','reversed','cancelled') THEN RAISE EXCEPTION 'Final accounting records are immutable'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_voucher_immutable BEFORE UPDATE OR DELETE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_immutability();
CREATE TRIGGER trg_voucher_entries_immutable BEFORE UPDATE OR DELETE ON public.voucher_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_immutability();

CREATE OR REPLACE FUNCTION public.create_gl_voucher_internal(
  _type public.voucher_type, _date date, _entries jsonb, _narration text DEFAULT NULL,
  _reference text DEFAULT NULL, _source_table text DEFAULT NULL, _source_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL, _status public.voucher_status DEFAULT 'posted',
  _created_by uuid DEFAULT NULL, _reversal_of uuid DEFAULT NULL)
RETURNS public.vouchers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.vouchers; fy uuid; item jsonb; n integer:=0;
BEGIN
  IF _status NOT IN ('draft','posted') THEN RAISE EXCEPTION 'Invalid initial status'; END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO result FROM public.vouchers WHERE idempotency_key=_idempotency_key;
    IF FOUND THEN RETURN result; END IF;
  END IF;
  IF _source_table IS NOT NULL AND _source_id IS NOT NULL THEN
    SELECT * INTO result FROM public.vouchers WHERE source_table=_source_table AND source_id=_source_id;
    IF FOUND THEN RETURN result; END IF;
  END IF;
  fy:=public.resolve_financial_year(_date);
  IF EXISTS (SELECT 1 FROM public.financial_years WHERE id=fy AND status='closed') THEN
    RAISE EXCEPTION 'Financial year is closed for %', _date;
  END IF;
  PERFORM set_config('app.accounting_lifecycle','on',true);
  INSERT INTO public.vouchers(voucher_number,voucher_type,voucher_date,narration,reference,source_table,source_id,
    financial_year_id,created_by,status,idempotency_key,posted_at,posted_by,reversal_of,is_locked)
  VALUES(public.next_voucher_number(_type),_type,_date,_narration,_reference,_source_table,_source_id,fy,_created_by,
    _status,_idempotency_key,CASE WHEN _status='posted' THEN now() END,
    CASE WHEN _status='posted' THEN _created_by END,_reversal_of,_status='posted') RETURNING * INTO result;
  FOR item IN SELECT value FROM jsonb_array_elements(_entries) LOOP
    n:=n+1;
    INSERT INTO public.voucher_entries(voucher_id,ledger_account_id,cost_center_id,debit,credit,narration,line_order)
    VALUES(result.id,(item->>'ledger_account_id')::uuid,NULLIF(item->>'cost_center_id','')::uuid,
      COALESCE((item->>'debit')::numeric,0),COALESCE((item->>'credit')::numeric,0),
      NULLIF(item->>'narration',''),COALESCE((item->>'line_order')::integer,n));
  END LOOP;
  IF _status='posted' THEN PERFORM public.validate_voucher(result.id); END IF;
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO result FROM public.vouchers WHERE idempotency_key=_idempotency_key;
    IF FOUND THEN RETURN result; END IF;
  END IF;
  RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.create_gl_voucher(_type public.voucher_type,_date date,_entries jsonb,
  _narration text DEFAULT NULL,_reference text DEFAULT NULL,_idempotency_key text DEFAULT NULL,
  _status public.voucher_status DEFAULT 'posted')
RETURNS public.vouchers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_accounting_role();
  RETURN public.create_gl_voucher_internal(_type,_date,_entries,_narration,_reference,NULL,NULL,
    _idempotency_key,_status,auth.uid(),NULL);
END $$;

CREATE OR REPLACE FUNCTION public.post_gl_voucher(_id uuid)
RETURNS public.vouchers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.vouchers;
BEGIN
  PERFORM public.assert_accounting_role();
  SELECT * INTO result FROM public.vouchers WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher not found'; END IF;
  IF result.status='posted' THEN RETURN result; END IF;
  IF result.status<>'draft' THEN RAISE EXCEPTION 'Only drafts can be posted'; END IF;
  IF EXISTS (SELECT 1 FROM public.financial_years WHERE id=result.financial_year_id AND status='closed') THEN
    RAISE EXCEPTION 'Financial year is closed'; END IF;
  PERFORM public.validate_voucher(result.id);
  PERFORM set_config('app.accounting_lifecycle','on',true);
  UPDATE public.vouchers SET status='posted',posted_at=now(),posted_by=auth.uid(),is_locked=true
  WHERE id=result.id RETURNING * INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_gl_voucher(_id uuid,_date date,_reason text)
RETURNS public.vouchers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE original public.vouchers; result public.vouchers; entries jsonb;
BEGIN
  PERFORM public.assert_accounting_role();
  IF NULLIF(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Reversal reason required'; END IF;
  SELECT * INTO original FROM public.vouchers WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher not found'; END IF;
  IF original.status='reversed' THEN SELECT * INTO result FROM public.vouchers WHERE reversal_of=original.id; RETURN result; END IF;
  IF original.status<>'posted' THEN RAISE EXCEPTION 'Only posted vouchers can be reversed'; END IF;
  SELECT jsonb_agg(jsonb_build_object('ledger_account_id',ledger_account_id,'cost_center_id',cost_center_id,
    'debit',credit,'credit',debit,'narration',COALESCE(narration,_reason),'line_order',line_order) ORDER BY line_order)
  INTO entries FROM public.voucher_entries WHERE voucher_id=original.id;
  result:=public.create_gl_voucher_internal(original.voucher_type,_date,entries,
    'Reversal of '||original.voucher_number||': '||_reason,original.voucher_number,NULL,NULL,
    'reversal:'||original.id::text,'posted',auth.uid(),original.id);
  PERFORM set_config('app.accounting_lifecycle','on',true);
  UPDATE public.vouchers SET status='reversed',reversed_by=result.id,cancellation_reason=_reason,is_locked=true
  WHERE id=original.id;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_gl_voucher(_id uuid,_reason text,_date date DEFAULT CURRENT_DATE)
RETURNS public.vouchers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE original public.vouchers; result public.vouchers;
BEGIN
  PERFORM public.assert_accounting_role();
  IF NULLIF(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;
  SELECT * INTO original FROM public.vouchers WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher not found'; END IF;
  IF original.status='draft' THEN
    PERFORM set_config('app.accounting_lifecycle','on',true);
    UPDATE public.vouchers SET status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
      cancellation_reason=_reason,is_locked=true WHERE id=original.id RETURNING * INTO result;
    RETURN result;
  END IF;
  IF original.status IN ('cancelled','reversed') THEN RETURN original; END IF;
  result:=public.reverse_gl_voucher(original.id,_date,_reason);
  PERFORM set_config('app.accounting_lifecycle','on',true);
  UPDATE public.vouchers SET status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
    cancellation_reason=_reason WHERE id=original.id;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.replace_draft_gl_voucher(_id uuid,_date date,_entries jsonb,
  _narration text DEFAULT NULL,_reference text DEFAULT NULL)
RETURNS public.vouchers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.vouchers; fy uuid; item jsonb; n integer:=0;
BEGIN
  PERFORM public.assert_accounting_role();
  SELECT * INTO result FROM public.vouchers WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher not found'; END IF;
  IF result.status<>'draft' THEN RAISE EXCEPTION 'Only draft vouchers can be changed'; END IF;
  fy:=public.resolve_financial_year(_date);
  IF EXISTS (SELECT 1 FROM public.financial_years WHERE id=fy AND status='closed') THEN
    RAISE EXCEPTION 'Financial year is closed for %',_date; END IF;
  PERFORM set_config('app.accounting_lifecycle','on',true);
  DELETE FROM public.voucher_entries WHERE voucher_id=result.id;
  UPDATE public.vouchers SET voucher_date=_date,narration=_narration,reference=_reference,financial_year_id=fy
  WHERE id=result.id RETURNING * INTO result;
  FOR item IN SELECT value FROM jsonb_array_elements(_entries) LOOP
    n:=n+1;
    INSERT INTO public.voucher_entries(voucher_id,ledger_account_id,cost_center_id,debit,credit,narration,line_order)
    VALUES(result.id,(item->>'ledger_account_id')::uuid,NULLIF(item->>'cost_center_id','')::uuid,
      COALESCE((item->>'debit')::numeric,0),COALESCE((item->>'credit')::numeric,0),
      NULLIF(item->>'narration',''),COALESCE((item->>'line_order')::integer,n));
  END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.guard_financial_year_control()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.accounting_lifecycle',true)<>'on' AND
    (NEW.status IS DISTINCT FROM OLD.status OR NEW.is_locked IS DISTINCT FROM OLD.is_locked OR
     NEW.closed_at IS DISTINCT FROM OLD.closed_at OR NEW.reopened_at IS DISTINCT FROM OLD.reopened_at)
  THEN RAISE EXCEPTION 'Use the controlled close or reopen operation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_financial_year_control BEFORE UPDATE ON public.financial_years
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_year_control();

CREATE OR REPLACE FUNCTION public.close_financial_year(_id uuid)
RETURNS public.financial_years LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fy public.financial_years; result public.financial_years;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator required'; END IF;
  SELECT * INTO fy FROM public.financial_years WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Financial year not found'; END IF;
  IF fy.status='closed' THEN RETURN fy; END IF;
  IF EXISTS (SELECT 1 FROM public.vouchers WHERE financial_year_id=fy.id AND status='draft') THEN
    RAISE EXCEPTION 'Financial year has draft vouchers'; END IF;
  IF EXISTS (SELECT 1 FROM public.vouchers v WHERE v.financial_year_id=fy.id AND v.status IN ('posted','reversed')
    AND EXISTS (SELECT 1 FROM public.voucher_entries ve WHERE ve.voucher_id=v.id
      GROUP BY ve.voucher_id HAVING round(sum(ve.debit),2)<>round(sum(ve.credit),2))) THEN
    RAISE EXCEPTION 'Financial year contains an unbalanced voucher'; END IF;
  PERFORM set_config('app.accounting_lifecycle','on',true);
  UPDATE public.financial_years SET status='closed',is_locked=true,closed_at=now(),closed_by=auth.uid(),is_current=false
  WHERE id=fy.id RETURNING * INTO result;
  INSERT INTO public.financial_year_events(financial_year_id,action,performed_by) VALUES(fy.id,'closed',auth.uid());
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.reopen_financial_year(_id uuid,_reason text)
RETURNS public.financial_years LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fy public.financial_years; result public.financial_years;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator required'; END IF;
  IF NULLIF(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Reopen reason required'; END IF;
  SELECT * INTO fy FROM public.financial_years WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Financial year not found'; END IF;
  IF fy.status='open' THEN RETURN fy; END IF;
  PERFORM set_config('app.accounting_lifecycle','on',true);
  UPDATE public.financial_years SET status='open',is_locked=false,reopened_at=now(),reopened_by=auth.uid(),reopen_reason=_reason
  WHERE id=fy.id RETURNING * INTO result;
  INSERT INTO public.financial_year_events(financial_year_id,action,reason,performed_by)
  VALUES(fy.id,'reopened',_reason,auth.uid());
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.get_ledger_balances(_from date,_to date)
RETURNS TABLE(ledger_id uuid,name text,group_id uuid,group_name text,nature public.ledger_nature,
  opening_balance numeric,opening_balance_type text,total_debit numeric,total_credit numeric,closing_balance numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
SELECT la.id,la.name,la.group_id,lg.name,lg.nature,
  abs((CASE WHEN la.opening_balance_type='dr' THEN la.opening_balance ELSE -la.opening_balance END)
    +COALESCE(sum(ve.debit-ve.credit) FILTER(WHERE v.voucher_date<_from),0)),
  CASE WHEN (CASE WHEN la.opening_balance_type='dr' THEN la.opening_balance ELSE -la.opening_balance END)
    +COALESCE(sum(ve.debit-ve.credit) FILTER(WHERE v.voucher_date<_from),0)>=0 THEN 'dr' ELSE 'cr' END,
  COALESCE(sum(ve.debit) FILTER(WHERE v.voucher_date BETWEEN _from AND _to),0),
  COALESCE(sum(ve.credit) FILTER(WHERE v.voucher_date BETWEEN _from AND _to),0),
  (CASE WHEN la.opening_balance_type='dr' THEN la.opening_balance ELSE -la.opening_balance END)
    +COALESCE(sum(ve.debit-ve.credit) FILTER(WHERE v.voucher_date<=_to),0)
FROM public.ledger_accounts la JOIN public.ledger_groups lg ON lg.id=la.group_id
LEFT JOIN public.voucher_entries ve ON ve.ledger_account_id=la.id
LEFT JOIN public.vouchers v ON v.id=ve.voucher_id AND v.status IN ('posted','reversed')
GROUP BY la.id,la.name,la.group_id,lg.name,lg.nature,la.opening_balance,la.opening_balance_type;
$$;

REVOKE INSERT,UPDATE,DELETE ON public.vouchers FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.voucher_entries FROM authenticated;
REVOKE UPDATE ON public.voucher_number_series FROM authenticated;
REVOKE ALL ON FUNCTION public.next_voucher_number(public.voucher_type) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_gl_voucher_internal(public.voucher_type,date,jsonb,text,text,text,uuid,text,public.voucher_status,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_gl_voucher(public.voucher_type,date,jsonb,text,text,text,public.voucher_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_gl_voucher(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_draft_gl_voucher(uuid,date,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_gl_voucher(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_gl_voucher(uuid,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_financial_year(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_financial_year(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ledger_balances(date,date) TO authenticated;

-- Existing sales and purchase creation remains compatible, but now uses the same
-- atomic, balanced, idempotent posting path as manual vouchers.
CREATE OR REPLACE FUNCTION public.post_invoice_to_voucher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE party_ledger uuid; sales_ledger uuid; cgst_ledger uuid; sgst_ledger uuid; igst_ledger uuid;
  interstate boolean; half_tax numeric; entries jsonb;
BEGIN
  party_ledger:=public.get_or_create_party_ledger(NEW.party_id);
  SELECT id INTO sales_ledger FROM public.ledger_accounts WHERE name='Sales' LIMIT 1;
  SELECT id INTO cgst_ledger FROM public.ledger_accounts WHERE name='Output CGST' LIMIT 1;
  SELECT id INTO sgst_ledger FROM public.ledger_accounts WHERE name='Output SGST' LIMIT 1;
  SELECT id INTO igst_ledger FROM public.ledger_accounts WHERE name='Output IGST' LIMIT 1;
  interstate:=NEW.dispatch_state_code IS NOT NULL AND NEW.supplier_gstin IS NOT NULL
    AND NEW.dispatch_state_code<>substring(NEW.supplier_gstin,1,2);
  entries:=jsonb_build_array(
    jsonb_build_object('ledger_account_id',party_ledger,'debit',NEW.total_amount,'credit',0),
    jsonb_build_object('ledger_account_id',sales_ledger,'debit',0,'credit',NEW.subtotal));
  IF NEW.tax_amount>0 THEN
    IF interstate THEN
      entries:=entries||jsonb_build_array(jsonb_build_object('ledger_account_id',igst_ledger,'debit',0,'credit',NEW.tax_amount));
    ELSE
      half_tax:=NEW.tax_amount/2;
      entries:=entries||jsonb_build_array(
        jsonb_build_object('ledger_account_id',cgst_ledger,'debit',0,'credit',half_tax),
        jsonb_build_object('ledger_account_id',sgst_ledger,'debit',0,'credit',NEW.tax_amount-half_tax));
    END IF;
  END IF;
  PERFORM public.create_gl_voucher_internal('sales',NEW.invoice_date,entries,'Auto: Invoice '||NEW.invoice_number,
    NEW.invoice_number,'invoices',NEW.id,'invoice:'||NEW.id::text,'posted',auth.uid(),NULL);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.post_purchase_to_voucher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE supplier_ledger uuid; purchase_ledger uuid; entries jsonb;
BEGIN
  IF NEW.supplier_id IS NULL THEN RETURN NEW; END IF;
  supplier_ledger:=public.get_or_create_supplier_ledger(NEW.supplier_id);
  SELECT id INTO purchase_ledger FROM public.ledger_accounts WHERE name='Purchases' LIMIT 1;
  entries:=jsonb_build_array(
    jsonb_build_object('ledger_account_id',purchase_ledger,'debit',NEW.total_amount,'credit',0),
    jsonb_build_object('ledger_account_id',supplier_ledger,'debit',0,'credit',NEW.total_amount));
  PERFORM public.create_gl_voucher_internal('purchase',NEW.bill_date,entries,'Auto: Bill '||NEW.bill_number,
    NEW.bill_number,'purchase_bills',NEW.id,'purchase-bill:'||NEW.id::text,'posted',auth.uid(),NULL);
  RETURN NEW;
END $$;