DROP POLICY IF EXISTS "users update own profile" ON public.profiles;

CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      id = auth.uid()
      AND status = (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
      AND approved_by IS NOT DISTINCT FROM (SELECT p.approved_by FROM public.profiles p WHERE p.id = auth.uid())
      AND approved_at IS NOT DISTINCT FROM (SELECT p.approved_at FROM public.profiles p WHERE p.id = auth.uid())
    )
  );