CREATE TABLE public.velocity_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  velocity_id text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  pincode text,
  country text,
  is_active boolean NOT NULL DEFAULT true,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.velocity_warehouses TO authenticated;
GRANT ALL ON public.velocity_warehouses TO service_role;

ALTER TABLE public.velocity_warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view velocity warehouses"
ON public.velocity_warehouses FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER velocity_warehouses_touch
BEFORE UPDATE ON public.velocity_warehouses
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();