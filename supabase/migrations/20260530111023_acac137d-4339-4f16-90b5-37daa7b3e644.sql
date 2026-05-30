ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false;

-- Allow each authenticated user to read the minimal directory (name + dept + opt-in)
-- so admin/HR UIs and notification routing can resolve recipients.
-- Note: number is read-restricted to self + admin via a separate view if needed later.
