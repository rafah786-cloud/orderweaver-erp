
-- =========================================================
-- BOQ / Purchases module
-- =========================================================

-- ---------- raw_materials ----------
CREATE TABLE public.raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  current_stock numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_materials TO authenticated;
GRANT ALL ON public.raw_materials TO service_role;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY rm_read ON public.raw_materials FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'production')
);
CREATE POLICY rm_write ON public.raw_materials FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'));
CREATE TRIGGER rm_touch BEFORE UPDATE ON public.raw_materials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- suppliers ----------
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gstin text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY sup_read ON public.suppliers FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production')
);
CREATE POLICY sup_write ON public.suppliers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'));
CREATE TRIGGER sup_touch BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- purchase_bills ----------
CREATE TABLE public.purchase_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_bills TO authenticated;
GRANT ALL ON public.purchase_bills TO service_role;
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY pb_read ON public.purchase_bills FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production')
);
CREATE POLICY pb_write ON public.purchase_bills FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'));
CREATE TRIGGER pb_touch BEFORE UPDATE ON public.purchase_bills
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- purchase_bill_items ----------
CREATE TABLE public.purchase_bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id uuid NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
  raw_material_id uuid NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric GENERATED ALWAYS AS (quantity * unit_price) STORED
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_bill_items TO authenticated;
GRANT ALL ON public.purchase_bill_items TO service_role;
ALTER TABLE public.purchase_bill_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY pbi_access ON public.purchase_bill_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_bills pb WHERE pb.id = purchase_bill_items.purchase_bill_id
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'))))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'));

-- Stock-in trigger: increase raw material stock when a purchase line is added/changed/removed
CREATE OR REPLACE FUNCTION public.apply_purchase_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.raw_materials SET current_stock = current_stock + NEW.quantity WHERE id = NEW.raw_material_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.raw_materials SET current_stock = current_stock - OLD.quantity WHERE id = OLD.raw_material_id;
    UPDATE public.raw_materials SET current_stock = current_stock + NEW.quantity WHERE id = NEW.raw_material_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.raw_materials SET current_stock = current_stock - OLD.quantity WHERE id = OLD.raw_material_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER pbi_stock_in
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_bill_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_stock();

-- ---------- product_models ----------
CREATE TABLE public.product_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  size text,
  thickness text,
  cover_fabric text,
  foam_density text,
  warranty text,
  default_price numeric NOT NULL DEFAULT 0,
  extra_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_models TO authenticated;
GRANT ALL ON public.product_models TO service_role;
ALTER TABLE public.product_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_read ON public.product_models FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'production')
);
CREATE POLICY pm_write ON public.product_models FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'production'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'production'));
CREATE TRIGGER pm_touch BEFORE UPDATE ON public.product_models
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- model_boq (recipe) ----------
CREATE TABLE public.model_boq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.product_models(id) ON DELETE CASCADE,
  raw_material_id uuid NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  quantity_per_unit numeric NOT NULL DEFAULT 0,
  UNIQUE (model_id, raw_material_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_boq TO authenticated;
GRANT ALL ON public.model_boq TO service_role;
ALTER TABLE public.model_boq ENABLE ROW LEVEL SECURITY;
CREATE POLICY mbq_read ON public.model_boq FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'production')
);
CREATE POLICY mbq_write ON public.model_boq FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'production'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'production'));

-- ---------- link sales_order_items to product_models ----------
ALTER TABLE public.sales_order_items ADD COLUMN model_id uuid REFERENCES public.product_models(id) ON DELETE RESTRICT;

-- Stock-out trigger: when a sales-order line references a model, deduct raw materials per recipe
CREATE OR REPLACE FUNCTION public.apply_sales_stock_out()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.model_id IS NOT NULL THEN
    FOR r IN SELECT raw_material_id, quantity_per_unit FROM public.model_boq WHERE model_id = NEW.model_id LOOP
      UPDATE public.raw_materials SET current_stock = current_stock - (r.quantity_per_unit * NEW.quantity)
        WHERE id = r.raw_material_id;
    END LOOP;
  ELSIF TG_OP = 'DELETE' AND OLD.model_id IS NOT NULL THEN
    FOR r IN SELECT raw_material_id, quantity_per_unit FROM public.model_boq WHERE model_id = OLD.model_id LOOP
      UPDATE public.raw_materials SET current_stock = current_stock + (r.quantity_per_unit * OLD.quantity)
        WHERE id = r.raw_material_id;
    END LOOP;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER soi_stock_out
  AFTER INSERT OR DELETE ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_sales_stock_out();
