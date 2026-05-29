
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'sales', 'production', 'hr', 'customer', 'employee');
CREATE TYPE public.user_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.production_status AS ENUM ('received', 'in_production', 'qc', 'ready', 'dispatched');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'unpaid', 'partial', 'paid', 'cancelled');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'half_day', 'leave', 'holiday');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status public.user_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'approved')
$$;

CREATE OR REPLACE FUNCTION public.current_user_roles()
RETURNS SETOF public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
$$;

-- Profiles policies
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin insert profiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR id = auth.uid());

-- Roles policies
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;

  INSERT INTO public.profiles (id, full_name, email, phone, status, approved_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    CASE WHEN is_first_user THEN 'approved'::public.user_status ELSE 'pending'::public.user_status END,
    CASE WHEN is_first_user THEN now() ELSE NULL END
  );

  -- First user becomes admin automatically
  IF is_first_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ PARTIES (customers) ============
CREATE TABLE public.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 150000,
  -- Link to customer user account (optional)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Sales rep who owns this party
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parties TO authenticated;
GRANT ALL ON public.parties TO service_role;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER parties_touch BEFORE UPDATE ON public.parties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "parties read" ON public.parties FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'sales') AND (owner_id = auth.uid() OR owner_id IS NULL))
  OR (public.has_role(auth.uid(), 'customer') AND user_id = auth.uid())
);
CREATE POLICY "parties write admin/sales" ON public.parties FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));

-- ============ SALES ORDERS ============
CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_orders TO authenticated;
GRANT ALL ON public.sales_orders TO service_role;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER so_touch BEFORE UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "so read" ON public.sales_orders FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'production')
  OR (public.has_role(auth.uid(), 'sales') AND created_by = auth.uid())
  OR (public.has_role(auth.uid(), 'customer') AND party_id IN (SELECT id FROM public.parties WHERE user_id = auth.uid()))
);
CREATE POLICY "so write admin/sales" ON public.sales_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));

-- ============ SALES ORDER ITEMS ============
CREATE TABLE public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  size TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_items TO authenticated;
GRANT ALL ON public.sales_order_items TO service_role;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "soi access" ON public.sales_order_items FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.id = sales_order_id AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'production')
    OR (public.has_role(auth.uid(), 'sales') AND so.created_by = auth.uid())
    OR (public.has_role(auth.uid(), 'customer') AND so.party_id IN (SELECT id FROM public.parties WHERE user_id = auth.uid()))
  ))
) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  sales_order_id UUID REFERENCES public.sales_orders(id),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER inv_touch BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "inv read" ON public.invoices FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'sales') AND created_by = auth.uid())
  OR (public.has_role(auth.uid(), 'customer') AND party_id IN (SELECT id FROM public.parties WHERE user_id = auth.uid()))
);
CREATE POLICY "inv write admin/sales" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invi access" ON public.invoice_items FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'sales') AND i.created_by = auth.uid())
    OR (public.has_role(auth.uid(), 'customer') AND i.party_id IN (SELECT id FROM public.parties WHERE user_id = auth.uid()))
  ))
) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));

-- ============ PARTY OUTSTANDING VIEW ============
CREATE OR REPLACE VIEW public.party_outstanding AS
SELECT
  p.id AS party_id,
  p.name,
  p.credit_limit,
  COALESCE(SUM(CASE WHEN i.status IN ('unpaid','partial') THEN i.total_amount - i.paid_amount ELSE 0 END), 0) AS outstanding,
  MIN(CASE WHEN i.status IN ('unpaid','partial') AND (i.total_amount - i.paid_amount) > 0 THEN i.invoice_date END) AS oldest_unpaid_date
FROM public.parties p
LEFT JOIN public.invoices i ON i.party_id = p.id
GROUP BY p.id, p.name, p.credit_limit;
GRANT SELECT ON public.party_outstanding TO authenticated;

-- ============ PRODUCTION ORDERS ============
CREATE TABLE public.production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_number TEXT NOT NULL UNIQUE,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  status public.production_status NOT NULL DEFAULT 'received',
  started_at TIMESTAMPTZ,
  qc_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER po_touch BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "po read" ON public.production_orders FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'production')
  OR EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.id = sales_order_id AND (
    (public.has_role(auth.uid(), 'sales') AND so.created_by = auth.uid())
    OR (public.has_role(auth.uid(), 'customer') AND so.party_id IN (SELECT id FROM public.parties WHERE user_id = auth.uid()))
  ))
);
CREATE POLICY "po write admin/prod" ON public.production_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production'));

-- Auto-create production order on sales order insert
CREATE OR REPLACE FUNCTION public.create_production_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.production_orders (production_number, sales_order_id, status)
  VALUES ('PRD-' || NEW.order_number, NEW.id, 'received');
  RETURN NEW;
END;
$$;
CREATE TRIGGER so_create_production AFTER INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.create_production_order();

-- ============ EMPLOYEES ============
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,
  department TEXT,
  designation TEXT,
  date_of_joining DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Pay structure (per-employee, configurable)
  pay_type TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' or 'daily'
  basic_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  da NUMERIC(14,2) NOT NULL DEFAULT 0,
  hra NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_allowances NUMERIC(14,2) NOT NULL DEFAULT 0,
  daily_wage NUMERIC(14,2) NOT NULL DEFAULT 0,
  ot_rate_per_hour NUMERIC(14,2) NOT NULL DEFAULT 0,
  pf_deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
  esi_deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER emp_touch BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "emp read" ON public.employees FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR user_id = auth.uid()
);
CREATE POLICY "emp write admin/hr" ON public.employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- ============ ATTENDANCE ============
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'present',
  in_time TIME,
  out_time TIME,
  hours_worked NUMERIC(5,2),
  ot_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, attendance_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "att read" ON public.attendance FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "att write admin/hr" ON public.attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

-- ============ PAYSLIPS ============
CREATE TABLE public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_year INT NOT NULL,
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  days_worked NUMERIC(5,2) NOT NULL DEFAULT 0,
  days_absent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ot_hours NUMERIC(7,2) NOT NULL DEFAULT 0,
  gross_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO authenticated;
GRANT ALL ON public.payslips TO service_role;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pay read" ON public.payslips FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "pay write admin/hr" ON public.payslips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));
