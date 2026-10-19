-- Attach audit triggers only to the new WS0 foundation tables; no existing domain flow is wired.
BEGIN;

CREATE FUNCTION public.ws0_audit_foundation_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row jsonb;
  v_before jsonb;
  v_after jsonb;
  v_company uuid;
  v_entity uuid;
BEGIN
  IF NOT public.ws0_feature_enabled('audit') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP='DELETE' THEN v_row:=to_jsonb(OLD); ELSE v_row:=to_jsonb(NEW); END IF;
  v_company := NULLIF(v_row->>'company_id','')::uuid;
  v_entity := NULLIF(v_row->>'id','')::uuid;
  IF TG_OP IN ('UPDATE','DELETE') THEN v_before:=public.ws0_redact_audit_snapshot(to_jsonb(OLD)); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_after:=public.ws0_redact_audit_snapshot(to_jsonb(NEW)); END IF;
  INSERT INTO public.erp_domain_audit_log(company_id,module,entity_type,entity_id,action,before_data,after_data,actor_id,created_at)
  VALUES(v_company,'ws0',TG_TABLE_NAME,v_entity,lower(TG_OP),v_before,v_after,auth.uid(),now());
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.ws0_audit_foundation_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ws0_audit_approval_rules
AFTER INSERT OR UPDATE OR DELETE ON public.approval_rules
FOR EACH ROW EXECUTE FUNCTION public.ws0_audit_foundation_change();
CREATE TRIGGER ws0_audit_approval_requests
AFTER INSERT OR UPDATE OR DELETE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.ws0_audit_foundation_change();
CREATE TRIGGER ws0_audit_approval_decisions
AFTER INSERT OR UPDATE OR DELETE ON public.approval_decisions
FOR EACH ROW EXECUTE FUNCTION public.ws0_audit_foundation_change();

COMMIT;
