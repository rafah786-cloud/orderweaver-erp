
-- 1. Audit log table
CREATE TABLE public.voucher_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid,
  entry_id uuid,
  table_name text NOT NULL,
  action text NOT NULL, -- INSERT | UPDATE | DELETE
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_data jsonb,
  new_data jsonb,
  note text
);

GRANT SELECT, INSERT ON public.voucher_audit_log TO authenticated;
GRANT ALL ON public.voucher_audit_log TO service_role;

ALTER TABLE public.voucher_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit read"
  ON public.voucher_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "audit insert"
  ON public.voucher_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_val_voucher ON public.voucher_audit_log(voucher_id);
CREATE INDEX idx_val_changed_at ON public.voucher_audit_log(changed_at DESC);

-- 2. Period-lock helper
CREATE OR REPLACE FUNCTION public.is_period_locked(_d date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.financial_years
    WHERE is_locked = true AND _d BETWEEN start_date AND end_date
  )
$$;

-- 3. Enforce lock on vouchers (admins may override)
CREATE OR REPLACE FUNCTION public.enforce_voucher_period_lock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d date;
BEGIN
  IF TG_OP = 'DELETE' THEN d := OLD.voucher_date; ELSE d := NEW.voucher_date; END IF;
  IF public.is_period_locked(d) AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Period is locked for date %; only admins can override', d;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_voucher_period_lock ON public.vouchers;
CREATE TRIGGER trg_voucher_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_voucher_period_lock();

-- 4. Audit log triggers
CREATE OR REPLACE FUNCTION public.log_voucher_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.voucher_audit_log (voucher_id, table_name, action, changed_by, old_data, new_data)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    'vouchers',
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_voucher_audit ON public.vouchers;
CREATE TRIGGER trg_voucher_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.log_voucher_changes();

CREATE OR REPLACE FUNCTION public.log_voucher_entry_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.voucher_audit_log (voucher_id, entry_id, table_name, action, changed_by, old_data, new_data)
  VALUES (
    COALESCE(NEW.voucher_id, OLD.voucher_id),
    COALESCE(NEW.id, OLD.id),
    'voucher_entries',
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_voucher_entry_audit ON public.voucher_entries;
CREATE TRIGGER trg_voucher_entry_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.voucher_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_voucher_entry_changes();
