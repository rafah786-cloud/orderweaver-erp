-- Four-company accounting structure and controlled user-company assignment
BEGIN;

-- Repurpose the previously empty second shell as the official ABRAZ books.
UPDATE public.companies
SET code='ABRAZ',
    legal_name='ABRAZ SLEEPING SOLUTIONS',
    display_name='ABRAZ SLEEPING SOLUTIONS',
    mailing_name='ABRAZ SLEEPING SOLUTIONS',
    updated_at=now()
WHERE code='ZIZZ'
  AND NOT EXISTS (SELECT 1 FROM public.companies WHERE code='ABRAZ');

-- Add the two additional books. These are explicitly management/internal books;
-- they are not a mechanism for concealing taxable transactions.
INSERT INTO public.companies(code,legal_name,display_name,mailing_name,is_default)
SELECT 'ABOOD_MGMT','ABOOD TRADINGS - MANAGEMENT BOOKS','ABOOD TRADINGS - MANAGEMENT BOOKS','ABOOD TRADINGS - MANAGEMENT BOOKS',false
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE code='ABOOD_MGMT');

INSERT INTO public.companies(code,legal_name,display_name,mailing_name,is_default)
SELECT 'ABRAZ_MGMT','ABRAZ SLEEPING SOLUTIONS - MANAGEMENT BOOKS','ABRAZ SLEEPING SOLUTIONS - MANAGEMENT BOOKS','ABRAZ SLEEPING SOLUTIONS - MANAGEMENT BOOKS',false
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE code='ABRAZ_MGMT');

-- Initialize new books by cloning structure only from ABOOD; never clone balances,
-- parties, or transactions.
DO $$
DECLARE
  src uuid;
  newc uuid;
  g record;
  ng uuid;
  fy record;
BEGIN
  SELECT id INTO src FROM public.companies WHERE code='ABOOD';
  FOR newc IN SELECT id FROM public.companies WHERE code IN ('ABOOD_MGMT','ABRAZ_MGMT') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.ledger_groups WHERE company_id=newc) THEN
      CREATE TEMP TABLE IF NOT EXISTS _company_group_map(old_id uuid primary key,new_id uuid) ON COMMIT DROP;
      DELETE FROM _company_group_map;

      FOR g IN
        SELECT id,name,parent_id,nature,is_system
        FROM public.ledger_groups
        WHERE company_id=src
        ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END,name
      LOOP
        INSERT INTO public.ledger_groups(name,parent_id,nature,is_system,company_id)
        VALUES(g.name,(SELECT new_id FROM _company_group_map WHERE old_id=g.parent_id),g.nature,g.is_system,newc)
        RETURNING id INTO ng;
        INSERT INTO _company_group_map VALUES(g.id,ng);
      END LOOP;

      INSERT INTO public.ledger_accounts(
        name,group_id,opening_balance,opening_balance_type,is_active,is_system,
        mapped_party_id,mapped_supplier_id,gstin,notes,company_id
      )
      SELECT la.name,m.new_id,0,la.opening_balance_type,la.is_active,la.is_system,
             NULL,NULL,NULL,la.notes,newc
      FROM public.ledger_accounts la
      JOIN _company_group_map m ON m.old_id=la.group_id
      WHERE la.company_id=src AND la.is_active=true
        AND la.mapped_party_id IS NULL AND la.mapped_supplier_id IS NULL
      ON CONFLICT DO NOTHING;

      SELECT * INTO fy FROM public.financial_years WHERE company_id=src ORDER BY start_date DESC LIMIT 1;
      IF fy.id IS NOT NULL THEN
        INSERT INTO public.financial_years(name,start_date,end_date,is_current,is_locked,company_id)
        VALUES(fy.name,fy.start_date,fy.end_date,true,false,newc)
        ON CONFLICT DO NOTHING;
      END IF;

      INSERT INTO public.voucher_number_series(voucher_type,prefix,suffix,width,next_number,company_id)
      SELECT voucher_type,prefix,suffix,width,1,newc
      FROM public.voucher_number_series
      WHERE company_id=src
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Existing users and every new registrant land in ABOOD only. Additional company
-- access is granted later by an administrator through the approval workflow.
DO $$
DECLARE abood uuid;
BEGIN
  SELECT id INTO abood FROM public.companies WHERE code='ABOOD';
  UPDATE public.profiles SET active_company_id=abood;
  DELETE FROM public.user_company_access WHERE company_id<>abood;
  INSERT INTO public.user_company_access(user_id,company_id,is_default,can_view,can_create,can_edit,can_delete)
  SELECT id,abood,true,true,true,true,false FROM public.profiles
  ON CONFLICT(user_id,company_id) DO UPDATE
  SET is_default=true,can_view=true,can_create=true,can_edit=true;
END $$;

CREATE OR REPLACE FUNCTION public.assign_new_user_default_company()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE abood uuid;
BEGIN
  SELECT id INTO abood FROM public.companies WHERE code='ABOOD';
  NEW.active_company_id:=abood;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_default_company ON public.profiles;
CREATE TRIGGER trg_profiles_default_company
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_new_user_default_company();

CREATE OR REPLACE FUNCTION public.provision_user_abood_access()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE abood uuid;
BEGIN
  SELECT id INTO abood FROM public.companies WHERE code='ABOOD';
  INSERT INTO public.user_company_access(user_id,company_id,is_default,can_view,can_create,can_edit,can_delete)
  VALUES(NEW.id,abood,true,true,true,false,false)
  ON CONFLICT(user_id,company_id) DO UPDATE SET is_default=true,can_view=true;
  UPDATE public.user_company_access SET is_default=false WHERE user_id=NEW.id AND company_id<>abood;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_abood_access ON public.profiles;
CREATE TRIGGER trg_profiles_abood_access
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.provision_user_abood_access();

CREATE OR REPLACE FUNCTION public.set_user_company_access(p_user_id uuid,p_company_ids uuid[])
RETURNS TABLE(company_id uuid,can_view boolean,can_create boolean,can_edit boolean,can_delete boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE abood uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT id INTO abood FROM public.companies WHERE code='ABOOD';
  IF abood IS NULL THEN RAISE EXCEPTION 'ABOOD company not configured'; END IF;

  p_company_ids:=ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_company_ids,ARRAY[]::uuid[])||ARRAY[abood]) x
  );

  DELETE FROM public.user_company_access u
  WHERE u.user_id=p_user_id AND NOT (u.company_id=ANY(p_company_ids));

  INSERT INTO public.user_company_access(
    user_id,company_id,is_default,can_view,can_create,can_edit,can_delete
  )
  SELECT p_user_id,c.id,(c.id=abood),true,true,true,false
  FROM public.companies c WHERE c.id=ANY(p_company_ids)
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
END $$;

REVOKE ALL ON FUNCTION public.set_user_company_access(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_user_company_access(uuid,uuid[]) TO authenticated;

COMMIT;
