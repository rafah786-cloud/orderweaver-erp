BEGIN;

-- Final security boundary hardening for the four-book production configuration.

-- 1) Tax snapshots are an internal accounting operation only. They must not be
-- directly callable by ordinary authenticated clients because the function is
-- SECURITY DEFINER and reads/writes protected invoice tax data.
CREATE OR REPLACE FUNCTION public.snapshot_invoice_tax(p_invoice uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  company uuid := public.current_company_id();
BEGIN
  IF company IS NULL THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;

  IF NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'sales')
  ) THEN
    RAISE EXCEPTION 'Sales or accounting access required';
  END IF;

  SELECT *
  INTO inv
  FROM public.invoices
  WHERE id = p_invoice
    AND company_id = company
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found in active company';
  END IF;

  IF round(
       COALESCE(inv.cgst_amount,0)
       + COALESCE(inv.sgst_amount,0)
       + COALESCE(inv.igst_amount,0),
       2
     ) <> round(COALESCE(inv.tax_amount,0),2)
  THEN
    RAISE EXCEPTION 'Invoice tax components do not equal tax amount';
  END IF;

  IF COALESCE(inv.tax_amount,0) = 0 THEN
    DELETE FROM public.invoice_tax_snapshots
    WHERE invoice_id = p_invoice;
    RETURN;
  END IF;

  INSERT INTO public.invoice_tax_snapshots(
    invoice_id, taxable_value, cgst, sgst, igst, cess, company_id
  )
  VALUES(
    p_invoice,
    COALESCE(inv.subtotal,0),
    COALESCE(inv.cgst_amount,0),
    COALESCE(inv.sgst_amount,0),
    COALESCE(inv.igst_amount,0),
    0,
    company
  )
  ON CONFLICT(invoice_id) DO UPDATE SET
    taxable_value = EXCLUDED.taxable_value,
    cgst = EXCLUDED.cgst,
    sgst = EXCLUDED.sgst,
    igst = EXCLUDED.igst,
    cess = EXCLUDED.cess,
    company_id = EXCLUDED.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_invoice_tax(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Direct accounting-report RPCs must require accounting/management roles.
CREATE OR REPLACE FUNCTION public.get_ledger_balances_period(
  p_start date,
  p_end date
)
RETURNS TABLE(
  ledger_id uuid,
  name text,
  group_id uuid,
  group_name text,
  nature text,
  opening_balance numeric,
  opening_balance_type text,
  total_debit numeric,
  total_credit numeric,
  closing_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
  ) THEN
    RAISE EXCEPTION 'Accounting access required';
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'Invalid accounting period';
  END IF;

  RETURN QUERY
  WITH active AS (
    SELECT id
    FROM public.companies
    WHERE id = public.current_company_id()
      AND is_active
      AND public.has_company_access(id)
  ),
  base AS (
    SELECT
      la.id,
      la.name,
      la.group_id,
      lg.name AS group_name,
      lg.nature,
      CASE
        WHEN la.opening_balance_type='dr'
          THEN COALESCE(la.opening_balance,0)
        ELSE -COALESCE(la.opening_balance,0)
      END AS opening_signed
    FROM public.ledger_accounts la
    JOIN public.ledger_groups lg
      ON lg.id = la.group_id
     AND lg.company_id = la.company_id
    JOIN active a
      ON a.id = la.company_id
    WHERE COALESCE(la.is_active,true)
  ),
  mov AS (
    SELECT
      e.ledger_account_id,
      COALESCE(SUM(
        CASE WHEN v.voucher_date < p_start
             THEN e.debit-e.credit ELSE 0 END
      ),0) AS prior_net,
      COALESCE(SUM(
        CASE WHEN v.voucher_date BETWEEN p_start AND p_end
             THEN e.debit ELSE 0 END
      ),0) AS period_dr,
      COALESCE(SUM(
        CASE WHEN v.voucher_date BETWEEN p_start AND p_end
             THEN e.credit ELSE 0 END
      ),0) AS period_cr
    FROM public.voucher_entries e
    JOIN public.vouchers v
      ON v.id = e.voucher_id
     AND v.company_id = e.company_id
    WHERE e.company_id = public.current_company_id()
      AND public.has_company_access(e.company_id)
      AND v.voucher_date <= p_end
      AND COALESCE(v.status,'posted')='posted'
    GROUP BY e.ledger_account_id
  )
  SELECT
    b.id,
    b.name,
    b.group_id,
    b.group_name,
    b.nature,
    b.opening_signed + COALESCE(m.prior_net,0),
    CASE WHEN b.opening_signed >= 0 THEN 'dr' ELSE 'cr' END,
    COALESCE(m.period_dr,0),
    COALESCE(m.period_cr,0),
    b.opening_signed
      + COALESCE(m.prior_net,0)
      + COALESCE(m.period_dr,0)
      - COALESCE(m.period_cr,0)
  FROM base b
  LEFT JOIN mov m ON m.ledger_account_id = b.id
  ORDER BY b.group_name, b.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_consolidated_trial_balance(
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  company_id uuid,
  company_code text,
  company_name text,
  ledger_id uuid,
  ledger_name text,
  group_name text,
  debit numeric,
  credit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
  ) THEN
    RAISE EXCEPTION 'Accounting access required';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.code,
    c.display_name,
    la.id,
    la.name,
    lg.name,
    GREATEST(b.closing_balance,0),
    GREATEST(-b.closing_balance,0)
  FROM public.companies c
  JOIN public.user_company_access uca
    ON uca.company_id = c.id
   AND uca.user_id = auth.uid()
   AND COALESCE(uca.can_view,true)
  JOIN public.ledger_accounts la
    ON la.company_id = c.id
   AND COALESCE(la.is_active,true)
  JOIN public.ledger_groups lg
    ON lg.id = la.group_id
   AND lg.company_id = c.id
  JOIN LATERAL (
    SELECT
      COALESCE(la.opening_balance,0)
      + COALESCE(SUM(ve.debit-ve.credit),0) AS closing_balance
    FROM public.voucher_entries ve
    JOIN public.vouchers v ON v.id = ve.voucher_id
    WHERE ve.ledger_account_id = la.id
      AND ve.company_id = c.id
      AND v.company_id = c.id
      AND COALESCE(v.is_locked,true)
      AND v.voucher_date <= p_as_of
  ) b ON true
  WHERE c.is_active
  ORDER BY c.code, lg.name, la.name;
END;
$$;

-- 3) Settlement reversal gets an explicit authorization guard instead of
-- relying only on its nested reversal call.
CREATE OR REPLACE FUNCTION public.reverse_bill_settlement(
  p_voucher uuid,
  p_date date,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reversal_id uuid;
  a public.bill_allocations%ROWTYPE;
  reverse_entry uuid;
  company uuid := public.current_company_id();
BEGIN
  IF company IS NULL THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;

  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
  ) THEN
    RAISE EXCEPTION 'Accounting access required';
  END IF;

  IF NULLIF(trim(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'Reversal reason required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vouchers
    WHERE id = p_voucher
      AND company_id = company
  ) THEN
    RAISE EXCEPTION 'Settlement voucher not found in active company';
  END IF;

  reversal_id := public.reverse_gl_voucher(p_voucher,p_date,p_reason);

  FOR a IN
    SELECT *
    FROM public.bill_allocations
    WHERE settlement_voucher_id = p_voucher
      AND effect = 1
      AND company_id = company
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.bill_allocations
      WHERE reverses_allocation_id = a.id
        AND company_id = company
    ) THEN
      SELECT ve.id
      INTO reverse_entry
      FROM public.voucher_entries ve
      WHERE ve.voucher_id = reversal_id
        AND ve.ledger_account_id = (
          SELECT b.ledger_account_id
          FROM public.bills b
          WHERE b.id = a.bill_id
            AND b.company_id = company
        )
        AND ve.company_id = company
      ORDER BY ve.line_order
      LIMIT 1;

      IF reverse_entry IS NULL THEN
        RAISE EXCEPTION 'Settlement reversal has no party ledger entry';
      END IF;

      INSERT INTO public.bill_allocations(
        bill_id,
        settlement_voucher_id,
        settlement_voucher_entry_id,
        allocation_type,
        allocation_date,
        amount,
        effect,
        reverses_allocation_id,
        idempotency_key,
        created_by,
        company_id
      )
      VALUES(
        a.bill_id,
        reversal_id,
        reverse_entry,
        a.allocation_type,
        COALESCE(p_date,CURRENT_DATE),
        a.amount,
        -1,
        a.id,
        'reverse-allocation:'||a.id::text,
        auth.uid(),
        company
      );
    END IF;

    PERFORM public.refresh_canonical_bill_status(a.bill_id);

    UPDATE public.invoices i
    SET
      paid_amount = GREATEST(
        0,
        i.total_amount-public.bill_outstanding(a.bill_id)
      ),
      status = (
        CASE
          WHEN public.bill_outstanding(a.bill_id) <= 0.01
            THEN 'paid'
          ELSE 'partial'
        END
      )::public.invoice_status,
      updated_at = now()
    FROM public.bills b
    WHERE b.id = a.bill_id
      AND b.company_id = company
      AND b.source_invoice_id = i.id
      AND i.company_id = company;
  END LOOP;

  RETURN reversal_id;
END;
$$;

-- 4) Tally migration control functions must never operate on another company.
CREATE OR REPLACE FUNCTION public.validate_tally_migration_run(p_run uuid)
RETURNS TABLE(
  out_run_id uuid,
  out_status text,
  total_rows bigint,
  critical_issues bigint,
  warning_issues bigint,
  voucher_count bigint,
  unbalanced_vouchers bigint,
  duplicate_source_ids bigint,
  bill_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.tally_migration_runs%ROWTYPE;
  company uuid := public.current_company_id();
  v_total bigint;
  v_crit bigint;
  v_warn bigint;
  v_vouchers bigint;
  v_unbalanced bigint;
  v_dupes bigint;
  v_bills bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF company IS NULL OR NOT public.has_company_access(company) THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;

  SELECT *
  INTO r
  FROM public.tally_migration_runs tm
  WHERE tm.id = p_run
    AND tm.company_id = company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Migration run not found in active company';
  END IF;

  DELETE FROM public.tally_migration_issues tmi
  WHERE tmi.run_id = p_run
    AND tmi.company_id = company;

  INSERT INTO public.tally_migration_issues(
    run_id,row_id,company_id,severity,code,message,details
  )
  SELECT
    p_run,NULL,company,'critical','DUPLICATE_SOURCE_ID',
    'Multiple staged records share the same source identifier in the same record class.',
    jsonb_build_object('record_type',record_type,'source_id',source_id,'count',count(*))
  FROM public.tally_migration_rows tmr
  WHERE tmr.run_id=p_run
    AND tmr.company_id=company
    AND tmr.source_id IS NOT NULL
    AND btrim(tmr.source_id)<>''
  GROUP BY record_type,source_id
  HAVING count(*)>1;

  INSERT INTO public.tally_migration_issues(
    run_id,row_id,company_id,severity,code,message,details
  )
  SELECT
    p_run,tmr.id,company,'critical','UNSTABLE_VOUCHER_ID',
    'Voucher is missing a stable source identifier.',
    jsonb_build_object('source_key',tmr.source_key)
  FROM public.tally_migration_rows tmr
  WHERE tmr.run_id=p_run
    AND tmr.company_id=company
    AND tmr.record_type='voucher'
    AND (tmr.source_id IS NULL OR btrim(tmr.source_id)='');

  INSERT INTO public.tally_migration_issues(
    run_id,row_id,company_id,severity,code,message,details
  )
  SELECT
    p_run,x.id,company,'critical','UNBALANCED_VOUCHER',
    'Voucher debit and credit totals do not match.',
    jsonb_build_object('source_id',x.source_id,'debit',x.dr,'credit',x.cr)
  FROM (
    SELECT
      tmr.id,
      tmr.source_id,
      COALESCE((
        SELECT sum(COALESCE((e->>'debit')::numeric,0))
        FROM jsonb_array_elements(tmr.payload->'entries') e
      ),0) dr,
      COALESCE((
        SELECT sum(COALESCE((e->>'credit')::numeric,0))
        FROM jsonb_array_elements(tmr.payload->'entries') e
      ),0) cr
    FROM public.tally_migration_rows tmr
    WHERE tmr.run_id=p_run
      AND tmr.company_id=company
      AND tmr.record_type='voucher'
      AND tmr.lifecycle_state='posted'
  ) x
  WHERE round(x.dr,2)<>round(x.cr,2)
     OR x.dr<=0;

  INSERT INTO public.tally_migration_issues(
    run_id,row_id,company_id,severity,code,message,details
  )
  SELECT
    p_run,tmr.id,company,'warning','VOUCHER_WITHOUT_LINES',
    'Voucher contains fewer than two ledger entries.',
    jsonb_build_object('source_id',tmr.source_id)
  FROM public.tally_migration_rows tmr
  WHERE tmr.run_id=p_run
    AND tmr.company_id=company
    AND tmr.record_type='voucher'
    AND tmr.lifecycle_state='posted'
    AND jsonb_array_length(
      COALESCE(tmr.payload->'entries','[]'::jsonb)
    )<2;

  INSERT INTO public.tally_migration_issues(
    run_id,row_id,company_id,severity,code,message,details
  )
  SELECT
    p_run,tmr.id,company,'warning','NO_TALLY_STABLE_ALTER_ID',
    'Source row has no Alter ID; repeat imports should rely on payload hash/source key until a source Alter ID is available.',
    jsonb_build_object('record_type',tmr.record_type,'source_id',tmr.source_id)
  FROM public.tally_migration_rows tmr
  WHERE tmr.run_id=p_run
    AND tmr.company_id=company
    AND tmr.record_type IN (
      'group','ledger','stock_item','godown','batch','cost_center','voucher'
    )
    AND (tmr.alter_id IS NULL OR btrim(tmr.alter_id)='');

  SELECT count(*) INTO v_total
  FROM public.tally_migration_rows
  WHERE run_id=p_run AND company_id=company;

  SELECT count(*) INTO v_vouchers
  FROM public.tally_migration_rows
  WHERE run_id=p_run AND company_id=company AND record_type='voucher';

  SELECT count(*) INTO v_bills
  FROM public.tally_migration_rows
  WHERE run_id=p_run AND company_id=company AND record_type='bill';

  SELECT count(*) INTO v_crit
  FROM public.tally_migration_issues
  WHERE run_id=p_run AND company_id=company
    AND severity='critical' AND NOT resolved;

  SELECT count(*) INTO v_warn
  FROM public.tally_migration_issues
  WHERE run_id=p_run AND company_id=company AND severity='warning' AND NOT resolved;

  SELECT count(*) INTO v_dupes
  FROM public.tally_migration_issues
  WHERE run_id=p_run AND company_id=company AND code='DUPLICATE_SOURCE_ID';

  SELECT count(*) INTO v_unbalanced
  FROM public.tally_migration_issues
  WHERE run_id=p_run AND company_id=company AND code='UNBALANCED_VOUCHER';

  UPDATE public.tally_migration_runs
  SET
    status = CASE WHEN v_crit=0 THEN 'validated' ELSE 'staged' END,
    completed_at = CASE WHEN v_crit=0 THEN now() ELSE NULL END
  WHERE id=p_run AND company_id=company;

  RETURN QUERY
  SELECT
    p_run,
    CASE WHEN v_crit=0 THEN 'validated' ELSE 'staged' END,
    v_total,v_crit,v_warn,v_vouchers,v_unbalanced,v_dupes,v_bills;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_tally_migration_run(
  p_run uuid,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  control_type text,
  tally_value numeric,
  erp_value numeric,
  difference numeric,
  tolerance numeric,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.tally_migration_runs%ROWTYPE;
  company uuid := public.current_company_id();
  c uuid;
  tv numeric;
  ev numeric;
  d numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF company IS NULL OR NOT public.has_company_access(company) THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;

  SELECT *
  INTO r
  FROM public.tally_migration_runs
  WHERE id=p_run AND company_id=company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Migration run not found in active company';
  END IF;

  c := r.company_id;

  DELETE FROM public.tally_reconciliation_snapshots
  WHERE run_id=p_run AND company_id=company;

  FOR control_type,tv,ev IN
    SELECT * FROM (VALUES
      ('customers',COALESCE((r.control_totals->>'customers')::numeric,0),
        (SELECT count(*)::numeric FROM public.parties WHERE company_id=c)),
      ('vendors',COALESCE((r.control_totals->>'vendors')::numeric,0),
        (SELECT count(*)::numeric FROM public.suppliers WHERE company_id=c)),
      ('ledgers',COALESCE((r.control_totals->>'ledgers')::numeric,0),
        (SELECT count(*)::numeric FROM public.ledger_accounts WHERE company_id=c)),
      ('groups',COALESCE((r.control_totals->>'groups')::numeric,0),
        (SELECT count(*)::numeric FROM public.ledger_groups WHERE company_id=c)),
      ('stock_items',COALESCE((r.control_totals->>'stockItems')::numeric,0),
        (SELECT count(*)::numeric FROM public.stock_items WHERE company_id=c)),
      ('godowns',COALESCE((r.control_totals->>'godowns')::numeric,0),
        (SELECT count(*)::numeric FROM public.godowns WHERE company_id=c)),
      ('cost_centres',COALESCE((r.control_totals->>'costCentres')::numeric,0),
        (SELECT count(*)::numeric FROM public.cost_centers WHERE company_id=c)),
      ('bills',COALESCE((r.control_totals->>'bills')::numeric,0),
        (SELECT count(*)::numeric FROM public.bills WHERE company_id=c)),
      ('vouchers',COALESCE((r.control_totals->>'vouchers')::numeric,0),
        (SELECT count(*)::numeric FROM public.vouchers WHERE company_id=c AND voucher_date<=p_as_of)),
      ('voucher_debit',COALESCE((r.control_totals->>'voucherDebit')::numeric,0),
        (SELECT COALESCE(sum(e.debit),0)
         FROM public.voucher_entries e
         JOIN public.vouchers v ON v.id=e.voucher_id
         WHERE e.company_id=c AND v.company_id=c AND v.voucher_date<=p_as_of)),
      ('voucher_credit',COALESCE((r.control_totals->>'voucherCredit')::numeric,0),
        (SELECT COALESCE(sum(e.credit),0)
         FROM public.voucher_entries e
         JOIN public.vouchers v ON v.id=e.voucher_id
         WHERE e.company_id=c AND v.company_id=c AND v.voucher_date<=p_as_of))
    ) v(control_type,tally_value,erp_value)
  LOOP
    d := ev-tv;
    INSERT INTO public.tally_reconciliation_snapshots(
      run_id,company_id,as_of_date,control_type,
      tally_value,erp_value,difference,tolerance,status
    )
    VALUES(
      p_run,c,p_as_of,control_type,tv,ev,d,0.01,
      CASE WHEN abs(d)<=0.01 THEN 'match' ELSE 'difference' END
    );
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_tally_migration_run(p_run uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.tally_migration_runs%ROWTYPE;
  company uuid := public.current_company_id();
  critical bigint;
  diffs bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF company IS NULL OR NOT public.has_company_access(company) THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;

  SELECT *
  INTO r
  FROM public.tally_migration_runs
  WHERE id=p_run AND company_id=company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Migration run not found in active company';
  END IF;

  IF r.status <> 'validated' THEN
    RAISE EXCEPTION 'Migration run must be validated first';
  END IF;

  SELECT count(*) INTO critical
  FROM public.tally_migration_issues
  WHERE run_id=p_run AND company_id=company
    AND severity='critical' AND NOT resolved;

  IF critical>0 THEN
    RAISE EXCEPTION 'Critical migration issues remain';
  END IF;

  SELECT count(*) INTO diffs
  FROM public.tally_reconciliation_snapshots
  WHERE run_id=p_run AND company_id=company AND status='difference';

  IF diffs>0 THEN
    RAISE EXCEPTION 'Reconciliation differences remain';
  END IF;

  UPDATE public.tally_migration_runs
  SET status='approved',
      approved_by=auth.uid(),
      approved_at=now()
  WHERE id=p_run AND company_id=company;

  RETURN true;
END;
$$;

-- 5) The ERP is intentionally locked to the four approved books.
CREATE OR REPLACE FUNCTION public.create_company(
  _code text,
  _legal_name text,
  _display_name text,
  _mailing_name text DEFAULT NULL,
  _address text DEFAULT NULL,
  _state text DEFAULT NULL,
  _gstin text DEFAULT NULL,
  _pan text DEFAULT NULL,
  _base_currency text DEFAULT 'INR',
  _currency_symbol text DEFAULT '₹'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only administrators can create companies';
  END IF;

  RAISE EXCEPTION
    'Creation of new companies is disabled. Mattress Maestro is locked to the four approved books.';
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_company_books(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_code text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only administrators can initialize company books';
  END IF;

  SELECT code
  INTO company_code
  FROM public.companies
  WHERE id=_company_id AND is_active=true;

  IF company_code IS NULL OR company_code NOT IN (
    'ABOOD','ABRAZ','ABOOD_MGMT','ABRAZ_MGMT'
  ) THEN
    RAISE EXCEPTION 'Only the four approved active company books may be initialized';
  END IF;

  RETURN public._initialize_company_books_internal(_company_id);
END;
$$;

-- 6) Company-access mutation is an ordinary invoker function. The authenticated
-- admin server route calls it with the user's session, so RLS remains in force.
CREATE OR REPLACE FUNCTION public.set_user_company_access(
  p_user_id uuid,
  p_company_ids uuid[]
)
RETURNS TABLE(company_id uuid, can_view boolean, can_create boolean, can_edit boolean, can_delete boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=public
AS $$
DECLARE
  abood uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT id INTO abood
  FROM public.companies
  WHERE code='ABOOD' AND is_active=true;

  IF abood IS NULL THEN
    RAISE EXCEPTION 'Default ABOOD company is not available';
  END IF;

  p_company_ids:=ARRAY(
    SELECT DISTINCT x
    FROM unnest(
      COALESCE(p_company_ids,ARRAY[]::uuid[])||ARRAY[abood]
    ) x
  );

  DELETE FROM public.user_company_access u
  WHERE u.user_id=p_user_id
    AND NOT (u.company_id=ANY(p_company_ids));

  INSERT INTO public.user_company_access(
    user_id,company_id,is_default,can_view,can_create,can_edit,can_delete
  )
  SELECT
    p_user_id,c.id,(c.id=abood),true,true,true,false
  FROM public.companies c
  WHERE c.id=ANY(p_company_ids)
    AND c.is_active=true
    AND c.code IN ('ABOOD','ABRAZ','ABOOD_MGMT','ABRAZ_MGMT')
  ON CONFLICT(user_id,company_id) DO UPDATE SET
    is_default=EXCLUDED.is_default,
    can_view=true,
    can_create=EXCLUDED.can_create,
    can_edit=EXCLUDED.can_edit;

  UPDATE public.user_company_access
  SET is_default=(company_id=abood)
  WHERE user_id=p_user_id;

  RETURN QUERY
  SELECT u.company_id,u.can_view,u.can_create,u.can_edit,u.can_delete
  FROM public.user_company_access u
  WHERE u.user_id=p_user_id
  ORDER BY u.is_default DESC,u.company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_company_access(uuid,uuid[]) TO authenticated;

COMMIT;