-- Compensating action for 20261019100300_ws0_audit_triggers.sql.
-- Non-destructive: disables the new WS0 audit trigger path without dropping triggers or records.
BEGIN;
UPDATE public.ws0_feature_controls SET enabled=false,updated_at=now() WHERE feature_key='audit';
COMMIT;
