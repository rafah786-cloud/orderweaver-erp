
-- Device settings
CREATE TABLE public.device_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  name text NOT NULL,
  ip_address text NOT NULL,
  port integer NOT NULL DEFAULT 4370,
  poll_interval_ms integer NOT NULL DEFAULT 5000,
  api_key_hash text NOT NULL,
  last_seen_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_settings TO authenticated;
GRANT ALL ON public.device_settings TO service_role;
ALTER TABLE public.device_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device admin read" ON public.device_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "device admin write" ON public.device_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Shift settings (singleton)
CREATE TABLE public.shift_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_start time NOT NULL DEFAULT '09:00',
  shift_end time NOT NULL DEFAULT '18:00',
  late_grace_minutes integer NOT NULL DEFAULT 10,
  half_day_hours numeric NOT NULL DEFAULT 4,
  late_deduction_pct numeric NOT NULL DEFAULT 0,
  half_day_deduction_pct numeric NOT NULL DEFAULT 50,
  working_days_per_month integer NOT NULL DEFAULT 26,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.shift_settings DEFAULT VALUES;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_settings TO authenticated;
GRANT ALL ON public.shift_settings TO service_role;
ALTER TABLE public.shift_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift read" ON public.shift_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift admin write" ON public.shift_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Punch events
CREATE TYPE public.punch_type AS ENUM ('in', 'out');

CREATE TABLE public.punch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_code text NOT NULL,
  device_id text,
  punch_type public.punch_type NOT NULL,
  punch_time timestamptz NOT NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_punch_events_time ON public.punch_events(punch_time DESC);
CREATE INDEX idx_punch_events_employee ON public.punch_events(employee_id, punch_time);
GRANT SELECT ON public.punch_events TO authenticated;
GRANT ALL ON public.punch_events TO service_role;
ALTER TABLE public.punch_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "punch read" ON public.punch_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = punch_events.employee_id AND e.user_id = auth.uid())
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.punch_events;
ALTER TABLE public.punch_events REPLICA IDENTITY FULL;

-- Extend attendance
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS first_in timestamptz,
  ADD COLUMN IF NOT EXISTS last_out timestamptz,
  ADD COLUMN IF NOT EXISTS is_late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_early_exit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_half_day boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_emp_date
  ON public.attendance(employee_id, attendance_date);

-- Trigger function: upsert attendance from punch
CREATE OR REPLACE FUNCTION public.apply_punch_to_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.shift_settings%ROWTYPE;
  att_date date;
  cur public.attendance%ROWTYPE;
  late_threshold timestamptz;
  early_threshold timestamptz;
BEGIN
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO s FROM public.shift_settings LIMIT 1;
  att_date := (NEW.punch_time AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT * INTO cur FROM public.attendance
    WHERE employee_id = NEW.employee_id AND attendance_date = att_date;

  IF NOT FOUND THEN
    INSERT INTO public.attendance (employee_id, attendance_date, status, first_in, last_out, in_time, out_time)
    VALUES (NEW.employee_id, att_date, 'present',
      CASE WHEN NEW.punch_type='in' THEN NEW.punch_time END,
      CASE WHEN NEW.punch_type='out' THEN NEW.punch_time END,
      CASE WHEN NEW.punch_type='in' THEN NEW.punch_time::time END,
      CASE WHEN NEW.punch_type='out' THEN NEW.punch_time::time END);
  ELSE
    IF NEW.punch_type='in' AND (cur.first_in IS NULL OR NEW.punch_time < cur.first_in) THEN
      UPDATE public.attendance SET first_in=NEW.punch_time, in_time=NEW.punch_time::time
        WHERE id=cur.id;
    ELSIF NEW.punch_type='out' AND (cur.last_out IS NULL OR NEW.punch_time > cur.last_out) THEN
      UPDATE public.attendance SET last_out=NEW.punch_time, out_time=NEW.punch_time::time
        WHERE id=cur.id;
    END IF;
  END IF;

  -- Recompute flags
  SELECT * INTO cur FROM public.attendance
    WHERE employee_id = NEW.employee_id AND attendance_date = att_date;
  late_threshold := (att_date::text || ' ' || s.shift_start::text)::timestamp AT TIME ZONE 'Asia/Kolkata'
                    + (s.late_grace_minutes || ' minutes')::interval;
  early_threshold := (att_date::text || ' ' || s.shift_end::text)::timestamp AT TIME ZONE 'Asia/Kolkata';

  UPDATE public.attendance SET
    is_late = (cur.first_in IS NOT NULL AND cur.first_in > late_threshold),
    is_early_exit = (cur.last_out IS NOT NULL AND cur.last_out < early_threshold),
    hours_worked = CASE WHEN cur.first_in IS NOT NULL AND cur.last_out IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (cur.last_out - cur.first_in))/3600.0
                        ELSE 0 END,
    is_half_day = (cur.first_in IS NOT NULL AND cur.last_out IS NOT NULL
                   AND EXTRACT(EPOCH FROM (cur.last_out - cur.first_in))/3600.0 < s.half_day_hours)
  WHERE id = cur.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_punch_apply
AFTER INSERT ON public.punch_events
FOR EACH ROW EXECUTE FUNCTION public.apply_punch_to_attendance();

CREATE TRIGGER trg_shift_touch BEFORE UPDATE ON public.shift_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_device_touch BEFORE UPDATE ON public.device_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
