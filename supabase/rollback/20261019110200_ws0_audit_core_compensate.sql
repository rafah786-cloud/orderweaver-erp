-- Compensating action for 20261019100200_ws0_audit_core.sql.
-- Non-destructive: stops WS0 audit emission; existing audit rows and triggers are preserved.
BEGIN;
UPDATE public.ws0_feature_controls SET enabled=false,updated_at=now() WHERE feature_key='audit';
COMMIT;
