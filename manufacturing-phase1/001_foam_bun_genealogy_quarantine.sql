-- PREPARED ONLY — do not apply to the live database without the approved migration/recovery workflow.
-- Foam-bun traceability foundation. Existing production issue paths are NOT wired to this schema yet;
-- do not enable foam consumption against these tables until the canonical issue RPC enforces bun_lot_id.
BEGIN;

CREATE TABLE IF NOT EXISTS public.foam_bun_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bun_code text NOT NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  stock_batch_id uuid REFERENCES public.stock_batches(id) ON DELETE RESTRICT,
  source_production_order_id uuid REFERENCES public.production_orders(id) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (btrim(unit) <> ''),
  cure_started_at timestamptz NOT NULL,
  required_cure_hours numeric(8,2) NOT NULL CHECK (required_cure_hours >= 0),
  released_at timestamptz,
  status text NOT NULL DEFAULT 'curing'
    CHECK (status IN ('curing', 'released', 'quarantined', 'consumed', 'rejected')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, bun_code),
  CHECK (released_at IS NULL OR released_at >= cure_started_at)
);

CREATE TABLE IF NOT EXISTS public.foam_bun_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  parent_bun_lot_id uuid NOT NULL REFERENCES public.foam_bun_lots(id) ON DELETE RESTRICT,
  child_bun_lot_id uuid NOT NULL REFERENCES public.foam_bun_lots(id) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (btrim(unit) <> ''),
  operation text NOT NULL CHECK (operation IN ('split', 'remnant', 'rework')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_bun_lot_id <> child_bun_lot_id),
  UNIQUE (parent_bun_lot_id, child_bun_lot_id, operation)
);

CREATE INDEX IF NOT EXISTS foam_bun_lots_company_status_idx
  ON public.foam_bun_lots(company_id, status, cure_started_at);
CREATE INDEX IF NOT EXISTS foam_bun_lineage_company_parent_idx
  ON public.foam_bun_lineage(company_id, parent_bun_lot_id);
CREATE INDEX IF NOT EXISTS foam_bun_lineage_company_child_idx
  ON public.foam_bun_lineage(company_id, child_bun_lot_id);

ALTER TABLE public.foam_bun_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foam_bun_lineage ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.foam_bun_lots TO authenticated;
GRANT SELECT, INSERT ON public.foam_bun_lineage TO authenticated;
GRANT ALL ON public.foam_bun_lots, public.foam_bun_lineage TO service_role;

DROP POLICY IF EXISTS foam_bun_lots_company_scope ON public.foam_bun_lots;
CREATE POLICY foam_bun_lots_company_scope ON public.foam_bun_lots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.has_company_access(company_id));
DROP POLICY IF EXISTS foam_bun_lots_read_production ON public.foam_bun_lots;
CREATE POLICY foam_bun_lots_read_production ON public.foam_bun_lots
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production'));
DROP POLICY IF EXISTS foam_bun_lots_write_production ON public.foam_bun_lots;
CREATE POLICY foam_bun_lots_write_production ON public.foam_bun_lots
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production'));
DROP POLICY IF EXISTS foam_bun_lots_update_production ON public.foam_bun_lots;
CREATE POLICY foam_bun_lots_update_production ON public.foam_bun_lots
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production'));

DROP POLICY IF EXISTS foam_bun_lineage_company_scope ON public.foam_bun_lineage;
CREATE POLICY foam_bun_lineage_company_scope ON public.foam_bun_lineage
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.has_company_access(company_id));
DROP POLICY IF EXISTS foam_bun_lineage_read_production ON public.foam_bun_lineage;
CREATE POLICY foam_bun_lineage_read_production ON public.foam_bun_lineage
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production'));
DROP POLICY IF EXISTS foam_bun_lineage_insert_production ON public.foam_bun_lineage;
CREATE POLICY foam_bun_lineage_insert_production ON public.foam_bun_lineage
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production'));

-- Validates cure status and minimum cure duration at the moment of an authorized release/issue call.
CREATE OR REPLACE FUNCTION public.assert_foam_bun_cured(p_bun_lot uuid, p_at timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lot public.foam_bun_lots%ROWTYPE;
BEGIN
  SELECT * INTO lot FROM public.foam_bun_lots
    WHERE id = p_bun_lot AND company_id = public.current_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'foam bun lot not found in active company'; END IF;
  IF lot.status <> 'released' OR lot.released_at IS NULL THEN
    RAISE EXCEPTION 'foam bun is quarantined or not released';
  END IF;
  IF p_at < lot.cure_started_at + make_interval(secs => lot.required_cure_hours * 3600) THEN
    RAISE EXCEPTION 'minimum curing interval has not elapsed';
  END IF;
  IF lot.released_at < lot.cure_started_at + make_interval(secs => lot.required_cure_hours * 3600) THEN
    RAISE EXCEPTION 'foam bun release predates completion of curing';
  END IF;
END;
$$;

-- Prevent cross-company lineage, cycles and premature lineage creation.
CREATE OR REPLACE FUNCTION public.validate_foam_bun_lineage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_lot public.foam_bun_lots%ROWTYPE; child_lot public.foam_bun_lots%ROWTYPE;
BEGIN
  SELECT * INTO parent_lot FROM public.foam_bun_lots
    WHERE id = NEW.parent_bun_lot_id AND company_id = NEW.company_id FOR SHARE;
  SELECT * INTO child_lot FROM public.foam_bun_lots
    WHERE id = NEW.child_bun_lot_id AND company_id = NEW.company_id FOR SHARE;
  IF NOT FOUND OR parent_lot.id IS NULL OR child_lot.id IS NULL THEN
    RAISE EXCEPTION 'parent and child bun lots must exist in the same company';
  END IF;
  IF parent_lot.status <> 'released' THEN RAISE EXCEPTION 'parent bun lot must be released before splitting'; END IF;
  PERFORM public.assert_foam_bun_cured(parent_lot.id, now());
  IF parent_lot.unit <> NEW.unit OR child_lot.unit <> NEW.unit THEN
    RAISE EXCEPTION 'parent, child and lineage units must match';
  END IF;
  IF EXISTS (
    WITH RECURSIVE descendants(id) AS (
      SELECT NEW.child_bun_lot_id
      UNION
      SELECT l.child_bun_lot_id FROM public.foam_bun_lineage l
      JOIN descendants d ON l.parent_bun_lot_id = d.id
      WHERE l.company_id = NEW.company_id
    )
    SELECT 1 FROM descendants WHERE id = NEW.parent_bun_lot_id
  ) THEN RAISE EXCEPTION 'foam bun lineage cycle rejected'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS foam_bun_lineage_validate ON public.foam_bun_lineage;
CREATE TRIGGER foam_bun_lineage_validate
  BEFORE INSERT OR UPDATE ON public.foam_bun_lineage
  FOR EACH ROW EXECUTE FUNCTION public.validate_foam_bun_lineage();

CREATE OR REPLACE FUNCTION public.validate_foam_bun_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'released' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.released_at IS DISTINCT FROM NEW.released_at) THEN
    IF NEW.released_at IS NULL OR NEW.released_at < NEW.cure_started_at + make_interval(secs => NEW.required_cure_hours * 3600) THEN
      RAISE EXCEPTION 'cannot release foam bun before the required cure interval';
    END IF;
  END IF;
  IF NEW.cure_started_at IS DISTINCT FROM OLD.cure_started_at AND OLD.status IN ('released','consumed') THEN
    RAISE EXCEPTION 'cure start cannot be changed after release or consumption';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS foam_bun_release_validate ON public.foam_bun_lots;
CREATE TRIGGER foam_bun_release_validate
  BEFORE UPDATE ON public.foam_bun_lots
  FOR EACH ROW EXECUTE FUNCTION public.validate_foam_bun_release();

COMMIT;

-- Activation limitation:
-- This staged schema does not yet intercept all existing production stock issues. Before live activation,
-- the canonical production-consumption RPC must require bun_lot_id for configured foam stock items,
-- call assert_foam_bun_cured, validate remaining quantity through stock_movements, and persist lot identity
-- on every issue. Do not claim end-to-end curing enforcement until that integration is implemented and tested.
