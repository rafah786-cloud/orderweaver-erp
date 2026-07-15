
-- 1) in_app_notifications: add explicit INSERT policy (admin-only from client; service_role bypasses RLS)
DROP POLICY IF EXISTS "ian insert admin" ON public.in_app_notifications;
CREATE POLICY "ian insert admin" ON public.in_app_notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) profiles: replace fragile self-referential WITH CHECK with a trigger
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK ((id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.id = auth.uid() THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Users cannot change their own approval status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_self_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

-- 3) purchase_bills: attach existing vendor-guard trigger so vendors cannot alter financial fields
DROP TRIGGER IF EXISTS trg_guard_vendor_purchase_bill_update ON public.purchase_bills;
CREATE TRIGGER trg_guard_vendor_purchase_bill_update
  BEFORE UPDATE ON public.purchase_bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_purchase_bill_update();
