-- Compensating action for 20261019100100_ws0_approval_security.sql.
-- Non-destructive: disable the feature and remove browser execution access to the new RPCs.
BEGIN;
UPDATE public.ws0_feature_controls SET enabled=false,updated_at=now() WHERE feature_key='approvals';
REVOKE EXECUTE ON FUNCTION public.ws0_submit_approval_request(uuid,uuid,text,text,uuid,numeric,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ws0_decide_approval_request(uuid,text,text) FROM PUBLIC, anon, authenticated;
COMMIT;
