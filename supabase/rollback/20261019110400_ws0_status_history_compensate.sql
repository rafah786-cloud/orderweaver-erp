-- Compensating action for 20261019100400_ws0_status_history.sql.
-- Non-destructive: disables future status-history RPC writes and preserves history.
BEGIN;
UPDATE public.ws0_feature_controls SET enabled=false,updated_at=now() WHERE feature_key='status_history';
REVOKE EXECUTE ON FUNCTION public.ws0_record_status_history(uuid,uuid,text,uuid,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
COMMIT;
