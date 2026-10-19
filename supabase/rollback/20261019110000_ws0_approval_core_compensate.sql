-- Compensating action for 20261019100000_ws0_approval_core.sql.
-- Non-destructive: disables new approval requests; preserves all rows and schema.
BEGIN;
UPDATE public.ws0_feature_controls SET enabled=false,updated_at=now() WHERE feature_key='approvals';
COMMIT;
