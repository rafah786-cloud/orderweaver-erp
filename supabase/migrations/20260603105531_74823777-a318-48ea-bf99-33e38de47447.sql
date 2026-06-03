
-- Phase 3: Inventory & Godowns

DO $$ BEGIN
  CREATE TYPE public.valuation_method AS ENUM ('fifo', 'lifo', 'weighted_avg', 'standard_cost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.stock_movement_type AS ENUM ('purchase', 'sale', 'production_in', 'production_out', 'transfer_in', 'transfer_out', 'adjustment', 'opening');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.godowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text UNIQUE,
  address text,
  parent_id uuid REFERENCES public.godowns(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.godowns TO authenticated;
GRANT ALL ON public.godowns TO service_role;
ALTER TABLE public.godowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "godowns read" ON public.godowns FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'sales'));
CREATE POLICY "godowns write" ON public.godowns FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'));

CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  unit text NOT NULL DEFAULT 'pcs',
  alternate_unit text,
  conversion_factor numeric NOT NULL DEFAULT 1,
  hsn_code text,
  gst_rate numeric NOT NULL DEFAULT 18,
  valuation_method public.valuation_method NOT NULL DEFAULT 'weighted_avg',
  reorder_level numeric NOT NULL DEFAULT 0,
  reorder_quantity numeric NOT NULL DEFAULT 0,
  min_stock numeric NOT NULL DEFAULT 0,
  max_stock numeric,
  standard_cost numeric NOT NULL DEFAULT 0,
  standard_price numeric NOT NULL DEFAULT 0,
  track_batches boolean NOT NULL DEFAULT false,
  mapped_raw_material_id uuid REFERENCES public.raw_materials(id) ON DELETE SET NULL,
  mapped_model_id uuid REFERENCES public.product_models(id) ON DELETE SET NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si read" ON public.stock_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'sales'));
CREATE POLICY "si write" ON public.stock_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'));

CREATE TABLE public.stock_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  mfg_date date,
  expiry_date date,
  godown_id uuid REFERENCES public.godowns(id),
  opening_qty numeric NOT NULL DEFAULT 0,
  opening_rate numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_item_id, batch_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_batches TO authenticated;
GRANT ALL ON public.stock_batches TO service_role;
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sb read" ON public.stock_batches FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'sales'));
CREATE POLICY "sb write" ON public.stock_batches FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production'));

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  godown_id uuid REFERENCES public.godowns(id),
  movement_type public.stock_movement_type NOT NULL,
  quantity numeric NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  source_table text,
  source_id uuid,
  voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  narration text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sm_item_date ON public.stock_movements(stock_item_id, movement_date);
CREATE INDEX idx_sm_godown ON public.stock_movements(godown_id);
CREATE INDEX idx_sm_source ON public.stock_movements(source_table, source_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sm read" ON public.stock_movements FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'sales'));
CREATE POLICY "sm write" ON public.stock_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'accountant'));

CREATE TABLE public.stock_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number text NOT NULL UNIQUE,
  journal_date date NOT NULL DEFAULT CURRENT_DATE,
  journal_type text NOT NULL DEFAULT 'adjustment',
  narration text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_journals TO authenticated;
GRANT ALL ON public.stock_journals TO service_role;
ALTER TABLE public.stock_journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sj read" ON public.stock_journals FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'production'));
CREATE POLICY "sj write" ON public.stock_journals FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'accountant'));

CREATE TABLE public.stock_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.stock_journals(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
  batch_id uuid REFERENCES public.stock_batches(id),
  from_godown_id uuid REFERENCES public.godowns(id),
  to_godown_id uuid REFERENCES public.godowns(id),
  direction text NOT NULL,
  quantity numeric NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  line_order int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_journal_entries TO authenticated;
GRANT ALL ON public.stock_journal_entries TO service_role;
ALTER TABLE public.stock_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sje access" ON public.stock_journal_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stock_journals j WHERE j.id = journal_id
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'accountant'))))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'production') OR has_role(auth.uid(),'accountant'));

CREATE TABLE public.stock_valuation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_method public.valuation_method NOT NULL DEFAULT 'weighted_avg',
  default_godown_id uuid REFERENCES public.godowns(id),
  allow_negative_stock boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_valuation_settings TO authenticated;
GRANT ALL ON public.stock_valuation_settings TO service_role;
ALTER TABLE public.stock_valuation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svs read" ON public.stock_valuation_settings FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'production'));
CREATE POLICY "svs write" ON public.stock_valuation_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'));

INSERT INTO public.godowns (name, code) VALUES ('Main Godown', 'MAIN') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.stock_valuation_settings (default_method, default_godown_id)
  SELECT 'weighted_avg', id FROM public.godowns
  WHERE code='MAIN' AND NOT EXISTS (SELECT 1 FROM public.stock_valuation_settings);

INSERT INTO public.stock_items (name, code, unit, reorder_level, mapped_raw_material_id, standard_cost)
SELECT rm.name, rm.code, rm.unit, rm.reorder_level, rm.id, 0
FROM public.raw_materials rm
WHERE NOT EXISTS (SELECT 1 FROM public.stock_items si WHERE si.mapped_raw_material_id = rm.id);

INSERT INTO public.stock_movements (movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, narration)
SELECT CURRENT_DATE, si.id, (SELECT id FROM public.godowns WHERE code='MAIN'),
       'opening', rm.current_stock, 0, 0, 'Opening backfill'
FROM public.stock_items si
JOIN public.raw_materials rm ON rm.id = si.mapped_raw_material_id
WHERE rm.current_stock <> 0
  AND NOT EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.stock_item_id = si.id AND sm.movement_type='opening');

CREATE TRIGGER trg_godowns_touch BEFORE UPDATE ON public.godowns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_stock_items_touch BEFORE UPDATE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_stock_batches_touch BEFORE UPDATE ON public.stock_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_stock_journals_touch BEFORE UPDATE ON public.stock_journals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_svs_touch BEFORE UPDATE ON public.stock_valuation_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.post_purchase_item_to_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE si_id uuid; pb record; def_g uuid;
BEGIN
  SELECT id INTO si_id FROM public.stock_items WHERE mapped_raw_material_id = NEW.raw_material_id LIMIT 1;
  IF si_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO pb FROM public.purchase_bills WHERE id = NEW.purchase_bill_id;
  SELECT default_godown_id INTO def_g FROM public.stock_valuation_settings LIMIT 1;
  INSERT INTO public.stock_movements (movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, source_table, source_id, narration)
    VALUES (COALESCE(pb.bill_date, CURRENT_DATE), si_id, def_g, 'purchase', NEW.quantity, NEW.unit_price,
      COALESCE(NEW.amount, NEW.quantity * NEW.unit_price), 'purchase_bill_items', NEW.id,
      'Purchase ' || COALESCE(pb.bill_number,''));
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_purchase_item_movement AFTER INSERT ON public.purchase_bill_items
  FOR EACH ROW EXECUTE FUNCTION public.post_purchase_item_to_movement();

CREATE OR REPLACE FUNCTION public.post_sales_item_to_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; si_id uuid; def_g uuid; so record;
BEGIN
  IF NEW.model_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO so FROM public.sales_orders WHERE id = NEW.sales_order_id;
  SELECT default_godown_id INTO def_g FROM public.stock_valuation_settings LIMIT 1;
  FOR r IN SELECT raw_material_id, quantity_per_unit FROM public.model_boq WHERE model_id = NEW.model_id LOOP
    SELECT id INTO si_id FROM public.stock_items WHERE mapped_raw_material_id = r.raw_material_id LIMIT 1;
    IF si_id IS NOT NULL THEN
      INSERT INTO public.stock_movements (movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, source_table, source_id, narration)
        VALUES (COALESCE(so.order_date, CURRENT_DATE), si_id, def_g, 'sale',
          -(r.quantity_per_unit * NEW.quantity), 0, 0, 'sales_order_items', NEW.id,
          'Sale ' || COALESCE(so.order_number,''));
    END IF;
  END LOOP;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_sales_item_movement AFTER INSERT ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.post_sales_item_to_movement();

CREATE OR REPLACE VIEW public.stock_summary AS
SELECT
  si.id AS stock_item_id, si.name, si.code, si.unit,
  si.reorder_level, si.min_stock, si.max_stock,
  COALESCE(SUM(sm.quantity), 0) AS current_qty,
  CASE WHEN COALESCE(SUM(sm.quantity) FILTER (WHERE sm.quantity > 0),0) > 0
       THEN COALESCE(SUM(sm.amount) FILTER (WHERE sm.quantity > 0),0) / NULLIF(SUM(sm.quantity) FILTER (WHERE sm.quantity > 0),0)
       ELSE 0 END AS avg_rate,
  COALESCE(SUM(sm.amount), 0) AS stock_value
FROM public.stock_items si
LEFT JOIN public.stock_movements sm ON sm.stock_item_id = si.id
GROUP BY si.id;
GRANT SELECT ON public.stock_summary TO authenticated;

CREATE OR REPLACE VIEW public.stock_godown_summary AS
SELECT
  si.id AS stock_item_id, si.name, si.code, si.unit,
  g.id AS godown_id, g.name AS godown_name,
  COALESCE(SUM(sm.quantity), 0) AS qty,
  COALESCE(SUM(sm.amount), 0) AS value
FROM public.stock_items si
CROSS JOIN public.godowns g
LEFT JOIN public.stock_movements sm ON sm.stock_item_id = si.id AND sm.godown_id = g.id
GROUP BY si.id, g.id;
GRANT SELECT ON public.stock_godown_summary TO authenticated;
