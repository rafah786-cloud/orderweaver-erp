-- Generic status-history ledger, not yet attached to existing business workflows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ws0_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  branch_id uuid,
  entity_type text NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 100),
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text,
  correlation_id uuid,
  approval_request_id uuid REFERENCES public.approval_requests(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ws0_status_history_entity_idx
  ON public.ws0_status_history(company_id,entity_type,entity_id,created_at DESC);
ALTER TABLE public.ws0_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ws0_status_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ws0_status_history TO authenticated;

CREATE POLICY ws0_status_history_scoped_read ON public.ws0_status_history
FOR SELECT TO authenticated
USING (public.ws0_scope_allowed(company_id,branch_id));

CREATE FUNCTION public.ws0_record_status_history(
  p_company_id uuid, p_branch_id uuid, p_entity_type text, p_entity_id uuid,
  p_from_status text, p_to_status text, p_reason text DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL, p_approval_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws0_feature_enabled('status_history')
     OR NOT public.ws0_scope_allowed(p_company_id,p_branch_id) THEN
    RAISE EXCEPTION 'Status history write denied: unauthorized scope or feature disabled';
  END IF;
  IF p_entity_id IS NULL OR p_entity_type IS NULL OR p_to_status IS NULL
     OR length(p_entity_type) NOT BETWEEN 1 AND 100 OR length(p_to_status)>100
     OR (p_from_status IS NOT NULL AND length(p_from_status)>100) THEN
    RAISE EXCEPTION 'Status history write denied: invalid input';
  END IF;
  IF p_approval_request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.approval_requests q
    WHERE q.id=p_approval_request_id AND q.company_id=p_company_id
      AND q.branch_id IS NOT DISTINCT FROM p_branch_id AND q.status='approved'
  ) THEN
    RAISE EXCEPTION 'Status history write denied: approval reference is not approved in this scope';
  END IF;
  INSERT INTO public.ws0_status_history(
    company_id,branch_id,entity_type,entity_id,from_status,to_status,changed_by,
    reason,correlation_id,approval_request_id
  ) VALUES (
    p_company_id,p_branch_id,p_entity_type,p_entity_id,p_from_status,p_to_status,
    auth.uid(),left(COALESCE(p_reason,''),500),p_correlation_id,p_approval_request_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;
REVOKE ALL ON FUNCTION public.ws0_record_status_history(uuid,uuid,text,uuid,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ws0_record_status_history(uuid,uuid,text,uuid,text,text,text,uuid,uuid) TO authenticated;

COMMIT;
