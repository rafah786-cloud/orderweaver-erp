CREATE TABLE IF NOT EXISTS public.velocity_auth_token (
  id TEXT PRIMARY KEY DEFAULT 'default',
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.velocity_auth_token TO service_role;
ALTER TABLE public.velocity_auth_token ENABLE ROW LEVEL SECURITY;