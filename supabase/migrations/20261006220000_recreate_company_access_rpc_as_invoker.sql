BEGIN;

DROP FUNCTION IF EXISTS public.set_user_company_access(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.set_user_company_access(
  p_user_id uuid,
  p_company_ids uuid[]
)
RETURNS TABLE(
  company_id uuid,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_delete boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  abood uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT c.id INTO abood
  FROM public.companies c
  WHERE c.code = 'ABOOD' AND c.is_active = true;

  IF abood IS NULL THEN
    RAISE EXCEPTION 'Default ABOOD company is not available';
  END IF;

  p_company_ids := ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_company_ids, ARRAY[]::uuid[]) || ARRAY[abood]) x
  );

  DELETE FROM public.user_company_access u
  WHERE u.user_id = p_user_id
    AND NOT (u.company_id = ANY(p_company_ids));

  INSERT INTO public.user_company_access(
    user_id, company_id, is_default, can_view, can_create, can_edit, can_delete
  )
  SELECT
    p_user_id,
    c.id,
    (c.id = abood),
    true,
    true,
    true,
    false
  FROM public.companies c
  WHERE c.id = ANY(p_company_ids)
    AND c.is_active = true
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    is_default = EXCLUDED.is_default,
    can_view = true,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit;

  UPDATE public.user_company_access u
  SET is_default = (u.company_id = abood)
  WHERE u.user_id = p_user_id;

  RETURN QUERY
  SELECT u.company_id, u.can_view, u.can_create, u.can_edit, u.can_delete
  FROM public.user_company_access u
  WHERE u.user_id = p_user_id
  ORDER BY u.is_default DESC, u.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_company_access(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_company_access(uuid, uuid[]) TO authenticated;

COMMIT;
