-- WS0 audit core reuses the existing erp_domain_audit_log sink.
-- Snapshots use an allowlist, not a blacklist, to avoid leaking PII/secrets.
BEGIN;

CREATE FUNCTION public.ws0_redact_audit_snapshot(p_data jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COALESCE(jsonb_object_agg(e.key,e.value), '{}'::jsonb)
  FROM jsonb_each(COALESCE(p_data,'{}'::jsonb)) AS e(key,value)
  WHERE e.key = ANY (ARRAY[
    'id','company_id','branch_id','rule_id','request_id','action_key','entity_type',
    'entity_id','requester_id','approver_id','created_by','status','decision',
    'required_approvals','amount','currency','min_amount','max_amount','priority',
    'is_active','created_at','updated_at','decided_at','expires_at','document_type',
    'fiscal_year','prefix','next_value','padding','from_status','to_status','changed_by',
    'correlation_id','approval_request_id'
  ])
$function$;
REVOKE ALL ON FUNCTION public.ws0_redact_audit_snapshot(jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.ws0_guard_append_only_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.module='ws0' OR NEW.module='ws0' THEN
      RAISE EXCEPTION 'WS0 audit rows are append-only';
    END IF;
    -- Preserve the pre-existing behavior for non-WS0 audit records.
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    IF OLD.module='ws0' THEN
      RAISE EXCEPTION 'WS0 audit rows are append-only';
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Unexpected operation for WS0 audit guard';
END
$function$;
REVOKE ALL ON FUNCTION public.ws0_guard_append_only_audit() FROM PUBLIC, anon, authenticated;

-- New trigger affects only rows tagged module='ws0'; other audit-log behavior is unchanged.
CREATE TRIGGER ws0_audit_rows_append_only
BEFORE UPDATE OR DELETE ON public.erp_domain_audit_log
FOR EACH ROW EXECUTE FUNCTION public.ws0_guard_append_only_audit();

COMMIT;
