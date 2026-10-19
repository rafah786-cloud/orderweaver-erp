-- WS0 approval core: additive tables only. Existing domain workflows are not wired here.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ws0_feature_controls (
  feature_key text PRIMARY KEY CHECK (feature_key IN ('approvals','audit','status_history','number_series')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
INSERT INTO public.ws0_feature_controls(feature_key, enabled)
VALUES ('approvals',true),('audit',true),('status_history',true),('number_series',true)
ON CONFLICT (feature_key) DO NOTHING;
ALTER TABLE public.ws0_feature_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ws0_feature_controls FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  branch_id uuid,
  action_key text NOT NULL CHECK (action_key ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  entity_type text NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 100),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  min_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (min_amount >= 0),
  max_amount numeric(18,2) CHECK (max_amount IS NULL OR max_amount >= min_amount),
  approver_roles text[] NOT NULL CHECK (cardinality(approver_roles) > 0),
  required_approvals smallint NOT NULL DEFAULT 1 CHECK (required_approvals BETWEEN 1 AND 10),
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ws0_approval_rules_lookup_idx
  ON public.approval_rules(company_id, action_key, entity_type, is_active, priority DESC);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  branch_id uuid,
  rule_id uuid NOT NULL REFERENCES public.approval_rules(id) ON DELETE RESTRICT,
  action_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  required_approvals smallint NOT NULL CHECK (required_approvals BETWEEN 1 AND 10),
  idempotency_key text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS ws0_approval_requests_idempotency_idx
  ON public.approval_requests(company_id, requester_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ws0_approval_requests_scope_idx
  ON public.approval_requests(company_id, branch_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  branch_id uuid,
  request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE RESTRICT,
  approver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  reason text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, approver_id)
);
CREATE INDEX IF NOT EXISTS ws0_approval_decisions_request_idx
  ON public.approval_decisions(request_id, decision);

ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.approval_rules, public.approval_requests, public.approval_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_rules TO authenticated;
GRANT SELECT ON public.approval_requests, public.approval_decisions TO authenticated;

COMMIT;
