
-- Recalc attendance for a given employee/date from punch_events
CREATE OR REPLACE FUNCTION public.recalc_attendance_day(_employee_id uuid, _date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.shift_settings%ROWTYPE;
  first_p timestamptz;
  last_p timestamptz;
  late_threshold timestamptz;
  early_threshold timestamptz;
  hrs numeric;
BEGIN
  SELECT * INTO s FROM public.shift_settings LIMIT 1;

  SELECT MIN(punch_time) FILTER (WHERE punch_type='in'),
         MAX(punch_time) FILTER (WHERE punch_type='out')
    INTO first_p, last_p
  FROM public.punch_events
  WHERE employee_id = _employee_id
    AND (punch_time AT TIME ZONE 'Asia/Kolkata')::date = _date;

  IF first_p IS NULL AND last_p IS NULL THEN
    DELETE FROM public.attendance WHERE employee_id = _employee_id AND attendance_date = _date;
    RETURN;
  END IF;

  late_threshold := (_date::text || ' ' || s.shift_start::text)::timestamp AT TIME ZONE 'Asia/Kolkata'
                    + (s.late_grace_minutes || ' minutes')::interval;
  early_threshold := (_date::text || ' ' || s.shift_end::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
  hrs := CASE WHEN first_p IS NOT NULL AND last_p IS NOT NULL
              THEN EXTRACT(EPOCH FROM (last_p - first_p))/3600.0 ELSE 0 END;

  INSERT INTO public.attendance (
    employee_id, attendance_date, status,
    first_in, last_out, in_time, out_time,
    hours_worked, is_late, is_early_exit, is_half_day
  ) VALUES (
    _employee_id, _date, 'present',
    first_p, last_p,
    first_p::time, last_p::time,
    hrs,
    (first_p IS NOT NULL AND first_p > late_threshold),
    (last_p IS NOT NULL AND last_p < early_threshold),
    (first_p IS NOT NULL AND last_p IS NOT NULL AND hrs < s.half_day_hours)
  )
  ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
    first_in = EXCLUDED.first_in,
    last_out = EXCLUDED.last_out,
    in_time = EXCLUDED.in_time,
    out_time = EXCLUDED.out_time,
    hours_worked = EXCLUDED.hours_worked,
    is_late = EXCLUDED.is_late,
    is_early_exit = EXCLUDED.is_early_exit,
    is_half_day = EXCLUDED.is_half_day,
    status = 'present';
END;
$$;

-- Ensure unique index for ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS attendance_emp_date_uidx
  ON public.attendance(employee_id, attendance_date);
