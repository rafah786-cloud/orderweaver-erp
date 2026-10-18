BEGIN;

-- Signup profile creation is handled by the SECURITY DEFINER trigger on auth.users.
-- A client should never be able to create its own profiles row and choose status,
-- approval metadata or other protected account fields. Preserve admin provisioning.
DROP POLICY IF EXISTS "admin insert profiles" ON public.profiles;
CREATE POLICY "admin insert profiles"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

COMMIT;
