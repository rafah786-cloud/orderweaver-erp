-- Make reporting views honor underlying RLS policies.
ALTER VIEW public.party_outstanding SET (security_invoker = true);
ALTER VIEW public.stock_summary SET (security_invoker = true);
ALTER VIEW public.stock_godown_summary SET (security_invoker = true);
ALTER VIEW public.ledger_balances SET (security_invoker = true);

REVOKE ALL ON public.party_outstanding FROM anon;
REVOKE ALL ON public.stock_summary FROM anon;
REVOKE ALL ON public.stock_godown_summary FROM anon;
REVOKE ALL ON public.ledger_balances FROM anon;
