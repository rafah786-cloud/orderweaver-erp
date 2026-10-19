-- WS0 approval security: all approval decisions are made through narrow RPCs.
-- A missing rule, ambiguous top-ranked rule, invalid scope or self-approval denies the action.
BEGIN;

CREATE OR REPLACE FUNCTION public.ws0_feature_enabled(p_feature text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COALESCE((SELECT enabled FROM public.ws0_feature_controls WHERE feature_key = p_feature), false)
$function$;

CREATE OR REPLACE FUNCTION public.ws0_scope_allowed(p_company_id uuid, p_branch_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_active_company uuid;
  v_active_branch uuid;
  v_branch_exists boolean;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL OR NOT public.is_approved(auth.uid()) THEN
    RETURN false;
  END IF;
  v_active_company := public.current_company_id();
  IF v_active_company IS DISTINCT FROM p_company_id
     OR NOT public.has_company_access(p_company_id) THEN
    RETURN false;
  END IF;
  IF p_branch_id IS NULL THEN
    RETURN true;
  END IF;

  -- Fail closed until the existing branch table and user's active-branch binding
  -- can be positively established. This migration does not invent branch membership.
  IF to_regclass('public.branches') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='branches' AND column_name='company_id'
     ) THEN
    RETURN false;
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.branches WHERE id = $1 AND company_id = $2)'
    INTO v_branch_exists USING p_branch_id, p_company_id;
  IF NOT v_branch_exists THEN
    RETURN false;
  END IF;
  SELECT CASE
           WHEN COALESCE(to_jsonb(p)->>'active_branch_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN (to_jsonb(p)->>'active_branch_id')::uuid
           ELSE NULL
         END
    INTO v_active_branch
  FROM public.profiles p
  WHERE p.id=auth.uid() AND p.status='approved';
  RETURN v_active_branch IS NOT NULL AND v_active_branch=p_branch_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.ws0_resolve_approval_rule(
  p_company_id uuid, p_branch_id uuid, p_action_key text, p_entity_type text,
  p_amount numeric, p_currency text
)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_specificity integer;
  v_priority integer;
  v_count integer;
  v_rule_id uuid;
BEGIN
  IF NOT public.ws0_feature_enabled('approvals')
     OR NOT public.ws0_scope_allowed(p_company_id,p_branch_id)
     OR p_amount IS NULL OR p_amount < 0
     OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Approval denied: invalid or unauthorized scope';
  END IF;

  WITH matching AS (
    SELECT r.*, (r.branch_id IS NOT NULL)::integer AS specificity
    FROM public.approval_rules r
    WHERE r.company_id=p_company_id
      AND (r.branch_id IS NULL OR r.branch_id=p_branch_id)
      AND r.action_key=p_action_key AND r.entity_type=p_entity_type
      AND r.currency=p_currency AND r.is_active
      AND p_amount >= r.min_amount
      AND (r.max_amount IS NULL OR p_amount <= r.max_amount)
  )
  SELECT max(specificity) INTO v_specificity FROM matching;
  IF v_specificity IS NULL THEN
    RAISE EXCEPTION 'No matching active approval rule; request denied';
  END IF;
  WITH matching AS (
    SELECT r.*, (r.branch_id IS NOT NULL)::integer AS specificity
    FROM public.approval_rules r
    WHERE r.company_id=p_company_id
      AND (r.branch_id IS NULL OR r.branch_id=p_branch_id)
      AND r.action_key=p_action_key AND r.entity_type=p_entity_type
      AND r.currency=p_currency AND r.is_active
      AND p_amount >= r.min_amount
      AND (r.max_amount IS NULL OR p_amount <= r.max_amount)
  )
  SELECT max(priority) INTO v_priority FROM matching WHERE specificity=v_specificity;
  WITH matching AS (
    SELECT r.id, (r.branch_id IS NOT NULL)::integer AS specificity, r.priority
    FROM public.approval_rules r
    WHERE r.company_id=p_company_id
      AND (r.branch_id IS NULL OR r.branch_id=p_branch_id)
      AND r.action_key=p_action_key AND r.entity_type=p_entity_type
      AND r.currency=p_currency AND r.is_active
      AND p_amount >= r.min_amount
      AND (r.max_amount IS NULL OR p_amount <= r.max_amount)
  )
  SELECT count(*), min(id) INTO v_count, v_rule_id
  FROM matching WHERE specificity=v_specificity AND priority=v_priority;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Ambiguous approval rules at winning priority; request denied';
  END IF;
  RETURN v_rule_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.ws0_submit_approval_request(
  p_company_id uuid, p_branch_id uuid, p_action_key text, p_entity_type text,
  p_entity_id uuid, p_amount numeric, p_currency text DEFAULT 'INR',
  p_reason text DEFAULT NULL, p_idempotency_key text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_rule_id uuid;
  v_rule public.approval_rules%ROWTYPE;
  v_id uuid;
  v_existing public.approval_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws0_feature_enabled('approvals')
     OR NOT public.ws0_scope_allowed(p_company_id,p_branch_id) THEN
    RAISE EXCEPTION 'Approval request denied: unauthorized scope or feature disabled';
  END IF;
  IF p_entity_id IS NULL OR p_action_key IS NULL OR p_entity_type IS NULL
     OR p_amount IS NULL OR p_amount < 0 OR p_currency !~ '^[A-Z]{3}$'
     OR (p_expires_at IS NOT NULL AND p_expires_at <= now()) THEN
    RAISE EXCEPTION 'Approval request denied: invalid input';
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.approval_requests
    WHERE company_id=p_company_id AND requester_id=auth.uid()
      AND idempotency_key=p_idempotency_key;
    IF FOUND THEN
      IF v_existing.action_key=p_action_key AND v_existing.entity_type=p_entity_type
         AND v_existing.entity_id=p_entity_id AND v_existing.amount=p_amount
         AND v_existing.currency=p_currency AND v_existing.branch_id IS NOT DISTINCT FROM p_branch_id THEN
        RETURN v_existing.id;
      END IF;
      RAISE EXCEPTION 'Approval request denied: idempotency key reused with different input';
    END IF;
  END IF;

  v_rule_id := public.ws0_resolve_approval_rule(p_company_id,p_branch_id,p_action_key,p_entity_type,p_amount,p_currency);
  SELECT * INTO STRICT v_rule FROM public.approval_rules WHERE id=v_rule_id AND is_active;
  INSERT INTO public.approval_requests(
    company_id,branch_id,rule_id,action_key,entity_type,entity_id,requester_id,
    amount,currency,reason,required_approvals,idempotency_key,expires_at
  ) VALUES (
    p_company_id,p_branch_id,v_rule_id,p_action_key,p_entity_type,p_entity_id,auth.uid(),
    p_amount,p_currency,left(COALESCE(p_reason,''),500),v_rule.required_approvals,p_idempotency_key,p_expires_at
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.ws0_decide_approval_request(
  p_request_id uuid, p_decision text, p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_request public.approval_requests%ROWTYPE;
  v_rule public.approval_rules%ROWTYPE;
  v_approved_count integer;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws0_feature_enabled('approvals') THEN
    RAISE EXCEPTION 'Approval decision denied: feature disabled or unauthenticated';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Approval decision denied: invalid decision';
  END IF;
  SELECT * INTO v_request FROM public.approval_requests
  WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT public.ws0_scope_allowed(v_request.company_id,v_request.branch_id) THEN
    RAISE EXCEPTION 'Approval decision denied: request not found in authorized scope';
  END IF;
  IF v_request.status <> 'pending' OR (v_request.expires_at IS NOT NULL AND v_request.expires_at <= now()) THEN
    RAISE EXCEPTION 'Approval decision denied: request is not pending';
  END IF;
  IF v_request.requester_id=auth.uid() THEN
    RAISE EXCEPTION 'Self-approval is prohibited';
  END IF;
  SELECT * INTO v_rule FROM public.approval_rules
  WHERE id=v_request.rule_id AND is_active AND company_id=v_request.company_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=auth.uid() AND ur.role::text = ANY(v_rule.approver_roles)
  ) THEN
    RAISE EXCEPTION 'Approval decision denied: no eligible approver role';
  END IF;
  INSERT INTO public.approval_decisions(company_id,branch_id,request_id,approver_id,decision,reason)
  VALUES(v_request.company_id,v_request.branch_id,v_request.id,auth.uid(),p_decision,left(COALESCE(p_reason,''),500));
  IF p_decision='rejected' THEN
    v_status := 'rejected';
  ELSE
    SELECT count(*) INTO v_approved_count FROM public.approval_decisions
    WHERE request_id=v_request.id AND decision='approved';
    v_status := CASE WHEN v_approved_count >= v_request.required_approvals THEN 'approved' ELSE 'pending' END;
  END IF;
  UPDATE public.approval_requests
  SET status=v_status, decided_at=CASE WHEN v_status IN ('approved','rejected') THEN now() ELSE NULL END
  WHERE id=v_request.id;
  RETURN v_status;
END
$function$;

CREATE POLICY ws0_approval_rules_admin_read ON public.approval_rules
  FOR SELECT TO authenticated
  USING (public.ws0_scope_allowed(company_id,branch_id) AND public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY ws0_approval_rules_admin_insert ON public.approval_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.ws0_scope_allowed(company_id,branch_id) AND public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY ws0_approval_rules_admin_update ON public.approval_rules
  FOR UPDATE TO authenticated
  USING (public.ws0_scope_allowed(company_id,branch_id) AND public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.ws0_scope_allowed(company_id,branch_id) AND public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY ws0_approval_rules_admin_delete ON public.approval_rules
  FOR DELETE TO authenticated
  USING (public.ws0_scope_allowed(company_id,branch_id) AND public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY ws0_approval_requests_scoped_read ON public.approval_requests
  FOR SELECT TO authenticated
  USING (
    public.ws0_scope_allowed(company_id,branch_id)
    AND (
      requester_id=auth.uid()
      OR public.has_role(auth.uid(),'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.approval_rules r
        WHERE r.id=approval_requests.rule_id
          AND EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id=auth.uid() AND ur.role::text = ANY(r.approver_roles))
      )
    )
  );
CREATE POLICY ws0_approval_decisions_scoped_read ON public.approval_decisions
  FOR SELECT TO authenticated
  USING (
    public.ws0_scope_allowed(company_id,branch_id)
    AND EXISTS (
      SELECT 1 FROM public.approval_requests q
      WHERE q.id=approval_decisions.request_id
        AND (q.requester_id=auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR EXISTS (SELECT 1 FROM public.approval_rules r WHERE r.id=q.rule_id
            AND EXISTS (SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id=auth.uid() AND ur.role::text = ANY(r.approver_roles))))
    )
  );

REVOKE ALL ON FUNCTION public.ws0_feature_enabled(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ws0_scope_allowed(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ws0_resolve_approval_rule(uuid,uuid,text,text,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ws0_submit_approval_request(uuid,uuid,text,text,uuid,numeric,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ws0_decide_approval_request(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ws0_submit_approval_request(uuid,uuid,text,text,uuid,numeric,text,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ws0_decide_approval_request(uuid,text,text) TO authenticated;

COMMIT;
