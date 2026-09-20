-- ISOLATED-ENVIRONMENT MIGRATION: requires Phase 1 and must not be applied to the shared live database.
CREATE TYPE public.bill_party_kind AS ENUM ('customer','supplier');
CREATE TYPE public.bill_reference_type AS ENUM ('opening','new_ref','on_account','advance');
CREATE TYPE public.bill_status AS ENUM ('open','partial','settled','cancelled');
CREATE TYPE public.bill_allocation_type AS ENUM ('against_ref','new_ref','on_account','advance');

CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_kind public.bill_party_kind NOT NULL,
  party_id uuid REFERENCES public.parties(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ledger_account_id uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  bill_reference text NOT NULL,
  bill_date date NOT NULL,
  due_date date,
  reference_type public.bill_reference_type NOT NULL DEFAULT 'new_ref',
  original_amount numeric(18,2) NOT NULL CHECK (original_amount > 0),
  currency_code text NOT NULL DEFAULT 'INR',
  source_voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  source_voucher_entry_id uuid NOT NULL REFERENCES public.voucher_entries(id) ON DELETE RESTRICT,
  status public.bill_status NOT NULL DEFAULT 'open',
  external_ref text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bills_exact_party CHECK (
    (party_kind='customer' AND party_id IS NOT NULL AND supplier_id IS NULL) OR
    (party_kind='supplier' AND supplier_id IS NOT NULL AND party_id IS NULL)
  ),
  CONSTRAINT bills_due_date_order CHECK (due_date IS NULL OR due_date >= bill_date),
  UNIQUE (source_voucher_entry_id),
  UNIQUE (party_kind, external_ref)
);
GRANT SELECT ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bills staff read" ON public.bills FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR
  (party_kind='customer' AND public.has_role(auth.uid(),'sales')) OR
  (party_kind='customer' AND public.has_role(auth.uid(),'customer') AND party_id IN (SELECT id FROM public.parties WHERE user_id=auth.uid())) OR
  (party_kind='supplier' AND public.has_role(auth.uid(),'production')) OR
  (party_kind='supplier' AND public.has_role(auth.uid(),'vendor') AND supplier_id IN (SELECT id FROM public.suppliers WHERE user_id=auth.uid()))
);
CREATE INDEX bills_party_status_due_idx ON public.bills(party_kind,party_id,supplier_id,status,due_date);
CREATE INDEX bills_ledger_date_idx ON public.bills(ledger_account_id,bill_date);

CREATE TABLE public.bill_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  settlement_voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  settlement_voucher_entry_id uuid NOT NULL REFERENCES public.voucher_entries(id) ON DELETE RESTRICT,
  allocation_type public.bill_allocation_type NOT NULL DEFAULT 'against_ref',
  allocation_date date NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  effect smallint NOT NULL DEFAULT 1 CHECK (effect IN (-1,1)),
  currency_code text NOT NULL DEFAULT 'INR',
  reverses_allocation_id uuid REFERENCES public.bill_allocations(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key),
  UNIQUE (reverses_allocation_id)
);
GRANT SELECT ON public.bill_allocations TO authenticated;
GRANT ALL ON public.bill_allocations TO service_role;
ALTER TABLE public.bill_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bill allocations read" ON public.bill_allocations FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bills b WHERE b.id=bill_id AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR
    (b.party_kind='customer' AND public.has_role(auth.uid(),'sales')) OR
    (b.party_kind='customer' AND public.has_role(auth.uid(),'customer') AND b.party_id IN (SELECT id FROM public.parties WHERE user_id=auth.uid())) OR
    (b.party_kind='supplier' AND public.has_role(auth.uid(),'production')) OR
    (b.party_kind='supplier' AND public.has_role(auth.uid(),'vendor') AND b.supplier_id IN (SELECT id FROM public.suppliers WHERE user_id=auth.uid()))
  ))
);
CREATE INDEX bill_allocations_bill_date_idx ON public.bill_allocations(bill_id,allocation_date);
CREATE INDEX bill_allocations_voucher_idx ON public.bill_allocations(settlement_voucher_id);

CREATE OR REPLACE FUNCTION public.refresh_bill_status(_bill_id uuid)
RETURNS public.bill_status LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE original numeric; applied numeric; result public.bill_status;
BEGIN
  SELECT original_amount INTO original FROM public.bills WHERE id=_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
  SELECT COALESCE(sum(effect*amount),0) INTO applied FROM public.bill_allocations WHERE bill_id=_bill_id;
  result:=CASE WHEN applied<=0 THEN 'open'::public.bill_status WHEN applied<original THEN 'partial'::public.bill_status ELSE 'settled'::public.bill_status END;
  UPDATE public.bills SET status=result,updated_at=now() WHERE id=_bill_id;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.create_bill_internal(
  _party_kind public.bill_party_kind,_party_id uuid,_supplier_id uuid,_ledger_account_id uuid,
  _reference text,_bill_date date,_due_date date,_reference_type public.bill_reference_type,
  _amount numeric,_currency text,_voucher_id uuid,_entry_id uuid,_external_ref text,_created_by uuid)
RETURNS public.bills LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.bills; v public.vouchers; e public.voucher_entries; mapped uuid;
BEGIN
  IF _amount<=0 THEN RAISE EXCEPTION 'Bill amount must be positive'; END IF;
  SELECT * INTO v FROM public.vouchers WHERE id=_voucher_id;
  SELECT * INTO e FROM public.voucher_entries WHERE id=_entry_id AND voucher_id=_voucher_id;
  IF v.id IS NULL OR e.id IS NULL OR v.status<>'posted' THEN RAISE EXCEPTION 'Bill source must be a posted voucher entry'; END IF;
  IF e.ledger_account_id<>_ledger_account_id THEN RAISE EXCEPTION 'Bill source ledger mismatch'; END IF;
  IF _party_kind='customer' THEN
    SELECT mapped_party_id INTO mapped FROM public.ledger_accounts WHERE id=_ledger_account_id;
    IF _party_id IS NULL OR _supplier_id IS NOT NULL OR mapped IS DISTINCT FROM _party_id OR e.debit<=0 OR e.credit<>0 THEN RAISE EXCEPTION 'Customer bill requires its debit party-ledger entry'; END IF;
  ELSE
    SELECT mapped_supplier_id INTO mapped FROM public.ledger_accounts WHERE id=_ledger_account_id;
    IF _supplier_id IS NULL OR _party_id IS NOT NULL OR mapped IS DISTINCT FROM _supplier_id OR e.credit<=0 OR e.debit<>0 THEN RAISE EXCEPTION 'Supplier bill requires its credit supplier-ledger entry'; END IF;
  END IF;
  IF round(CASE WHEN _party_kind='customer' THEN e.debit ELSE e.credit END,2)<>round(_amount,2) THEN RAISE EXCEPTION 'Bill amount must equal the source party-ledger line'; END IF;
  INSERT INTO public.bills(party_kind,party_id,supplier_id,ledger_account_id,bill_reference,bill_date,due_date,reference_type,original_amount,currency_code,source_voucher_id,source_voucher_entry_id,external_ref,created_by)
  VALUES(_party_kind,_party_id,_supplier_id,_ledger_account_id,_reference,_bill_date,_due_date,_reference_type,_amount,COALESCE(NULLIF(_currency,''),'INR'),_voucher_id,_entry_id,_external_ref,_created_by)
  ON CONFLICT (source_voucher_entry_id) DO UPDATE SET source_voucher_entry_id=EXCLUDED.source_voucher_entry_id RETURNING * INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.create_opening_bill(
  _party_kind public.bill_party_kind,_party_id uuid,_supplier_id uuid,_reference text,_date date,_due_date date,
  _amount numeric,_offset_ledger_id uuid,_external_ref text,_currency text DEFAULT 'INR')
RETURNS public.bills LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE party_ledger uuid; entries jsonb; v public.vouchers; entry_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') AND NOT public.has_role(auth.uid(),'accountant') THEN RAISE EXCEPTION 'Accounting access required'; END IF;
  IF _party_kind='customer' THEN party_ledger:=public.get_or_create_party_ledger(_party_id); entries:=jsonb_build_array(jsonb_build_object('ledger_account_id',party_ledger,'debit',_amount,'credit',0),jsonb_build_object('ledger_account_id',_offset_ledger_id,'debit',0,'credit',_amount));
  ELSE party_ledger:=public.get_or_create_supplier_ledger(_supplier_id); entries:=jsonb_build_array(jsonb_build_object('ledger_account_id',_offset_ledger_id,'debit',_amount,'credit',0),jsonb_build_object('ledger_account_id',party_ledger,'debit',0,'credit',_amount)); END IF;
  v:=public.create_gl_voucher_internal('journal',_date,entries,'Opening bill '||_reference,_reference,'opening_bills',NULL,'opening-bill:'||_party_kind::text||':'||_external_ref,'posted',auth.uid(),NULL);
  SELECT id INTO entry_id FROM public.voucher_entries WHERE voucher_id=v.id AND ledger_account_id=party_ledger;
  RETURN public.create_bill_internal(_party_kind,_party_id,_supplier_id,party_ledger,_reference,_date,_due_date,'opening',_amount,_currency,v.id,entry_id,_external_ref,auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.post_bill_settlement(
  _type public.voucher_type,_date date,_cash_ledger_id uuid,_allocations jsonb,_reference text,_idempotency_key text)
RETURNS public.vouchers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; b public.bills; first_kind public.bill_party_kind; first_ledger uuid; first_currency text; total numeric:=0; entries jsonb; v public.vouchers; party_entry uuid; existing public.vouchers;
BEGIN
  PERFORM public.assert_accounting_role();
  IF _type NOT IN ('receipt','payment') THEN RAISE EXCEPTION 'Bill settlement must be receipt or payment'; END IF;
  SELECT * INTO existing FROM public.vouchers WHERE idempotency_key=_idempotency_key;
  IF FOUND THEN RETURN existing; END IF;
  IF jsonb_array_length(_allocations)=0 THEN RAISE EXCEPTION 'At least one allocation required'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_allocations) ORDER BY value->>'bill_id' LOOP
    SELECT * INTO b FROM public.bills WHERE id=(item->>'bill_id')::uuid FOR UPDATE;
    IF NOT FOUND OR b.status='cancelled' THEN RAISE EXCEPTION 'Open bill not found'; END IF;
    IF first_kind IS NULL THEN first_kind:=b.party_kind; first_ledger:=b.ledger_account_id; first_currency:=b.currency_code; END IF;
    IF b.party_kind<>first_kind OR b.ledger_account_id<>first_ledger OR b.currency_code<>first_currency THEN RAISE EXCEPTION 'All allocations must use one party and currency'; END IF;
    IF (_type='receipt' AND b.party_kind<>'customer') OR (_type='payment' AND b.party_kind<>'supplier') THEN RAISE EXCEPTION 'Settlement type does not match bill party'; END IF;
    IF (item->>'amount')::numeric<=0 THEN RAISE EXCEPTION 'Allocation amount must be positive'; END IF;
    IF (item->>'amount')::numeric > b.original_amount-COALESCE((SELECT sum(effect*amount) FROM public.bill_allocations WHERE bill_id=b.id),0) THEN RAISE EXCEPTION 'Allocation exceeds outstanding amount'; END IF;
    total:=total+(item->>'amount')::numeric;
  END LOOP;
  IF _type='receipt' THEN entries:=jsonb_build_array(jsonb_build_object('ledger_account_id',_cash_ledger_id,'debit',total,'credit',0),jsonb_build_object('ledger_account_id',first_ledger,'debit',0,'credit',total));
  ELSE entries:=jsonb_build_array(jsonb_build_object('ledger_account_id',first_ledger,'debit',total,'credit',0),jsonb_build_object('ledger_account_id',_cash_ledger_id,'debit',0,'credit',total)); END IF;
  v:=public.create_gl_voucher_internal(_type,_date,entries,'Bill settlement',_reference,'bill_settlements',NULL,_idempotency_key,'posted',auth.uid(),NULL);
  SELECT id INTO party_entry FROM public.voucher_entries WHERE voucher_id=v.id AND ledger_account_id=first_ledger;
  FOR item IN SELECT value FROM jsonb_array_elements(_allocations) LOOP
    INSERT INTO public.bill_allocations(bill_id,settlement_voucher_id,settlement_voucher_entry_id,allocation_type,allocation_date,amount,currency_code,idempotency_key,created_by)
    VALUES((item->>'bill_id')::uuid,v.id,party_entry,COALESCE((item->>'allocation_type')::public.bill_allocation_type,'against_ref'),_date,(item->>'amount')::numeric,first_currency,_idempotency_key||':'||(item->>'bill_id'),auth.uid());
    PERFORM public.refresh_bill_status((item->>'bill_id')::uuid);
  END LOOP;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_bill_allocations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.bill_allocations; reverse_entry uuid;
BEGIN
  IF NEW.status='reversed' AND OLD.status='posted' AND NEW.reversed_by IS NOT NULL THEN
    FOR a IN SELECT * FROM public.bill_allocations WHERE settlement_voucher_id=NEW.id AND effect=1 LOOP
      SELECT id INTO reverse_entry FROM public.voucher_entries WHERE voucher_id=NEW.reversed_by AND ledger_account_id=(SELECT ledger_account_id FROM public.bills WHERE id=a.bill_id) LIMIT 1;
      INSERT INTO public.bill_allocations(bill_id,settlement_voucher_id,settlement_voucher_entry_id,allocation_type,allocation_date,amount,effect,currency_code,reverses_allocation_id,idempotency_key,created_by)
      VALUES(a.bill_id,NEW.reversed_by,reverse_entry,a.allocation_type,(SELECT voucher_date FROM public.vouchers WHERE id=NEW.reversed_by),a.amount,-1,a.currency_code,a.id,'reverse-allocation:'||a.id::text,auth.uid());
      PERFORM public.refresh_bill_status(a.bill_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_reverse_bill_allocations AFTER UPDATE OF status ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.reverse_bill_allocations();

CREATE OR REPLACE FUNCTION public.bill_outstanding_as_of(_as_of date,_kind public.bill_party_kind DEFAULT NULL)
RETURNS TABLE(bill_id uuid,party_kind public.bill_party_kind,party_id uuid,supplier_id uuid,bill_reference text,bill_date date,due_date date,original_amount numeric,allocated_amount numeric,outstanding_amount numeric,currency_code text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
SELECT b.id,b.party_kind,b.party_id,b.supplier_id,b.bill_reference,b.bill_date,b.due_date,b.original_amount,
  COALESCE(sum(a.effect*a.amount) FILTER(WHERE a.allocation_date<=_as_of),0),
  b.original_amount-COALESCE(sum(a.effect*a.amount) FILTER(WHERE a.allocation_date<=_as_of),0),b.currency_code
FROM public.bills b LEFT JOIN public.bill_allocations a ON a.bill_id=b.id
WHERE b.bill_date<=_as_of AND b.status<>'cancelled' AND (_kind IS NULL OR b.party_kind=_kind)
GROUP BY b.id HAVING b.original_amount-COALESCE(sum(a.effect*a.amount) FILTER(WHERE a.allocation_date<=_as_of),0)<>0;
$$;
CREATE OR REPLACE FUNCTION public.bill_ageing_as_of(_as_of date,_kind public.bill_party_kind DEFAULT NULL)
RETURNS TABLE(party_kind public.bill_party_kind,party_id uuid,supplier_id uuid,current_amount numeric,days_1_30 numeric,days_31_60 numeric,days_61_90 numeric,days_over_90 numeric,total_outstanding numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
SELECT x.party_kind,x.party_id,x.supplier_id,
 sum(CASE WHEN _as_of-COALESCE(x.due_date,x.bill_date)<=0 THEN x.outstanding_amount ELSE 0 END),
 sum(CASE WHEN _as_of-COALESCE(x.due_date,x.bill_date) BETWEEN 1 AND 30 THEN x.outstanding_amount ELSE 0 END),
 sum(CASE WHEN _as_of-COALESCE(x.due_date,x.bill_date) BETWEEN 31 AND 60 THEN x.outstanding_amount ELSE 0 END),
 sum(CASE WHEN _as_of-COALESCE(x.due_date,x.bill_date) BETWEEN 61 AND 90 THEN x.outstanding_amount ELSE 0 END),
 sum(CASE WHEN _as_of-COALESCE(x.due_date,x.bill_date)>90 THEN x.outstanding_amount ELSE 0 END),sum(x.outstanding_amount)
FROM public.bill_outstanding_as_of(_as_of,_kind) x GROUP BY x.party_kind,x.party_id,x.supplier_id;
$$;

REVOKE ALL ON FUNCTION public.refresh_bill_status(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_bill_internal(public.bill_party_kind,uuid,uuid,uuid,text,date,date,public.bill_reference_type,numeric,text,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_opening_bill(public.bill_party_kind,uuid,uuid,text,date,date,numeric,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_bill_settlement(public.voucher_type,date,uuid,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bill_outstanding_as_of(date,public.bill_party_kind) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bill_ageing_as_of(date,public.bill_party_kind) TO authenticated;
