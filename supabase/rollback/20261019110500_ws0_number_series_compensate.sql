-- Compensating action for 20261019100500_ws0_number_series.sql.
-- Non-destructive: disables new numbering allocations and preserves allocated numbers.
BEGIN;
UPDATE public.ws0_feature_controls SET enabled=false,updated_at=now() WHERE feature_key='number_series';
REVOKE EXECUTE ON FUNCTION public.ws0_next_document_number(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
COMMIT;
