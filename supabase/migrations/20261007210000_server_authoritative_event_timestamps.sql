-- Server-authoritative lifecycle event timestamps.
CREATE OR REPLACE FUNCTION public.enforce_vendor_invite_accepted_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.accepted_at IS NULL THEN NEW.accepted_at:=now(); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_vendor_ack_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.vendor_ack_status IS DISTINCT FROM OLD.vendor_ack_status THEN NEW.vendor_ack_at:=now(); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_trusted_device_last_used_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.last_used_at:=now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.enforce_device_last_seen_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.last_seen_at:=now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.enforce_gst_filed_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status='filed' THEN NEW.filed_at:=now(); END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF to_regclass('public.vendor_invites') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_vendor_invite_accepted_at ON public.vendor_invites;
    CREATE TRIGGER trg_vendor_invite_accepted_at BEFORE UPDATE ON public.vendor_invites FOR EACH ROW EXECUTE FUNCTION public.enforce_vendor_invite_accepted_at();
  END IF;
  IF to_regclass('public.purchase_bills') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_vendor_ack_at ON public.purchase_bills;
    CREATE TRIGGER trg_vendor_ack_at BEFORE UPDATE ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION public.enforce_vendor_ack_at();
  END IF;
  IF to_regclass('public.trusted_devices') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_trusted_device_last_used_at ON public.trusted_devices;
    CREATE TRIGGER trg_trusted_device_last_used_at BEFORE INSERT OR UPDATE ON public.trusted_devices FOR EACH ROW EXECUTE FUNCTION public.enforce_trusted_device_last_used_at();
  END IF;
  IF to_regclass('public.device_settings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_device_last_seen_at ON public.device_settings;
    CREATE TRIGGER trg_device_last_seen_at BEFORE UPDATE ON public.device_settings FOR EACH ROW EXECUTE FUNCTION public.enforce_device_last_seen_at();
  END IF;
  IF to_regclass('public.gst_returns') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_gst_filed_at ON public.gst_returns;
    CREATE TRIGGER trg_gst_filed_at BEFORE UPDATE ON public.gst_returns FOR EACH ROW EXECUTE FUNCTION public.enforce_gst_filed_at();
  END IF;
END $$;
