-- Restrict direct invocation of trigger-only audit logic and anonymous sales-order RPC access.
-- Authenticated sales users retain the explicit grant needed by the guarded RPC.
BEGIN;

REVOKE ALL ON FUNCTION public.audit_enterprise_domain_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_sales_order_atomic(uuid, date, date, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order_atomic(uuid, date, date, text, text, jsonb) TO authenticated, service_role;

COMMIT;
