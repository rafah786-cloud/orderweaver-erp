BEGIN;

CREATE OR REPLACE FUNCTION public.set_user_company_access(
  p_user_id uuid,
  p_company_ids uuid[]
)
RETURNS TABLE(
  out_company_id uuid,
  out_can_view boolean,
  out_can_create boolean,
  out_can_edit boolean,
  out_can_delete boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  abood uuid;
  requested uuid[];
  invalid_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT id INTO abood
  FROM public.companies
  WHERE code = 'ABOOD' AND is_active = true;

  IF abood IS NULL THEN
    RAISE EXCEPTION 'ABOOD company not configured';
  END IF;

  requested := COALESCE(p_company_ids, ARRAY[]::uuid[]) || ARRAY[abood];

  SELECT count(*) INTO invalid_count
  FROM unnest(requested) x(id)
  LEFT JOIN public.companies c ON c.id = x.id
  WHERE c.id IS NULL
     OR NOT c.is_active
     OR c.code NOT IN ('ABOOD','ABRAZ','ABOOD_MGMT','ABRAZ_MGMT');

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Only the four approved active company books may be assigned';
  END IF;

  p_company_ids := ARRAY(
    SELECT DISTINCT c.id
    FROM public.companies c
    WHERE c.is_active
      AND c.code IN ('ABOOD','ABRAZ','ABOOD_MGMT','ABRAZ_MGMT')
      AND c.id = ANY(requested)
    ORDER BY c.id
  );

  DELETE FROM public.user_company_access u
  WHERE u.user_id = p_user_id
    AND NOT (u.company_id = ANY(p_company_ids));

  INSERT INTO public.user_company_access(
    user_id, company_id, is_default, can_view, can_create, can_edit, can_delete
  )
  SELECT p_user_id, c.id, (c.id = abood), true, true, true, false
  FROM public.companies c
  WHERE c.id = ANY(p_company_ids)
  ON CONFLICT(user_id, company_id) DO UPDATE SET
    is_default = EXCLUDED.is_default,
    can_view = true,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit;

  UPDATE public.user_company_access
  SET is_default = (company_id = abood)
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT uca.company_id, uca.can_view, uca.can_create, uca.can_edit, uca.can_delete
  FROM public.user_company_access uca
  WHERE uca.user_id = p_user_id
  ORDER BY uca.is_default DESC, uca.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_company_access(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_user_company_access(uuid,uuid[]) TO authenticated;

COMMIT;
