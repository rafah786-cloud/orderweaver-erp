-- ISOLATED-ENVIRONMENT MIGRATION: do not apply to the shared live database.
-- Phase 3 inventory ledger. Additive schema only. Does not alter raw_materials,
-- stock_movements, or any live balance column. Current quantity is derived.

CREATE SCHEMA IF NOT EXISTS inventory_ledger;

CREATE TABLE IF NOT EXISTS inventory_ledger.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  valuation_method text NOT NULL DEFAULT 'weighted_avg'
    CHECK (valuation_method IN ('weighted_avg')),
  track_batches boolean NOT NULL DEFAULT false,
  allow_negative boolean NOT NULL DEFAULT false,
  standard_cost numeric(18,6) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_ledger.godowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS inventory_ledger.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory_ledger.items(id),
  batch_no text NOT NULL,
  mfg_date date,
  expiry_date date,
  UNIQUE (item_id, batch_no)
);

CREATE TABLE IF NOT EXISTS inventory_ledger.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('receipt','issue','transfer','production','reversal','reservation')),
  doc_number text NOT NULL,
  doc_date date NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  idempotency_key text UNIQUE,
  source_ref text,
  reverses uuid REFERENCES inventory_ledger.documents(id),
  reversed_by uuid REFERENCES inventory_ledger.documents(id),
  narration text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_ledger.movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES inventory_ledger.documents(id),
  item_id uuid NOT NULL REFERENCES inventory_ledger.items(id),
  godown_id uuid NOT NULL REFERENCES inventory_ledger.godowns(id),
  batch_id uuid REFERENCES inventory_ledger.batches(id),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  movement_type text NOT NULL,
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  rate numeric(18,6) NOT NULL CHECK (rate >= 0),
  amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_ledger.balances (
  item_id uuid NOT NULL REFERENCES inventory_ledger.items(id),
  godown_id uuid NOT NULL REFERENCES inventory_ledger.godowns(id),
  batch_id uuid REFERENCES inventory_ledger.batches(id),
  qty numeric(18,4) NOT NULL DEFAULT 0,
  value numeric(18,2) NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS balances_null_batch_unique
  ON inventory_ledger.balances (item_id, godown_id)
  WHERE batch_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS balances_batch_unique
  ON inventory_ledger.balances (item_id, godown_id, batch_id)
  WHERE batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_ledger.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory_ledger.items(id),
  godown_id uuid NOT NULL REFERENCES inventory_ledger.godowns(id),
  batch_id uuid REFERENCES inventory_ledger.batches(id),
  qty numeric(18,4) NOT NULL CHECK (qty > 0),
  source_ref text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','released','consumed')),
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_ledger.boms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_item_id uuid NOT NULL REFERENCES inventory_ledger.items(id),
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (finished_item_id, version)
);

CREATE TABLE IF NOT EXISTS inventory_ledger.bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id uuid NOT NULL REFERENCES inventory_ledger.boms(id) ON DELETE CASCADE,
  component_item_id uuid NOT NULL REFERENCES inventory_ledger.items(id),
  qty_per numeric(18,4) NOT NULL CHECK (qty_per > 0)
);

CREATE TABLE IF NOT EXISTS inventory_ledger.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES inventory_ledger.documents(id),
  event text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION inventory_ledger._balance_key(p_item uuid, p_godown uuid, p_batch uuid)
RETURNS inventory_ledger.balances
LANGUAGE plpgsql AS $$
DECLARE row inventory_ledger.balances;
BEGIN
  SELECT * INTO row FROM inventory_ledger.balances
  WHERE item_id = p_item AND godown_id = p_godown
    AND batch_id IS NOT DISTINCT FROM p_batch
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO inventory_ledger.balances(item_id, godown_id, batch_id, qty, value)
    VALUES (p_item, p_godown, p_batch, 0, 0)
    RETURNING * INTO row;
  END IF;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION inventory_ledger.on_hand(p_item uuid, p_godown uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(qty), 0) FROM inventory_ledger.balances
  WHERE item_id = p_item AND (p_godown IS NULL OR godown_id = p_godown);
$$;

CREATE OR REPLACE FUNCTION inventory_ledger.available(p_item uuid, p_godown uuid, p_batch uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT qty FROM inventory_ledger.balances
    WHERE item_id = p_item AND godown_id = p_godown AND batch_id IS NOT DISTINCT FROM p_batch
  ), 0) - COALESCE((
    SELECT sum(qty) FROM inventory_ledger.reservations
    WHERE item_id = p_item AND godown_id = p_godown
      AND batch_id IS NOT DISTINCT FROM p_batch AND status = 'open'
  ), 0);
$$;

CREATE OR REPLACE FUNCTION inventory_ledger.post_receipt(
  p_item uuid, p_godown uuid, p_qty numeric, p_rate numeric,
  p_doc_number text, p_doc_date date, p_idempotency text,
  p_batch uuid DEFAULT NULL, p_source text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  existing uuid;
  doc uuid;
  bal inventory_ledger.balances;
  amt numeric(18,2);
  item inventory_ledger.items;
BEGIN
  IF p_idempotency IS NOT NULL THEN
    SELECT id INTO existing FROM inventory_ledger.documents WHERE idempotency_key = p_idempotency;
    IF existing IS NOT NULL THEN RETURN existing; END IF;
  END IF;
  SELECT * INTO item FROM inventory_ledger.items WHERE id = p_item AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'inactive or missing item'; END IF;
  IF p_qty <= 0 OR p_rate < 0 THEN RAISE EXCEPTION 'receipt qty and rate must be positive'; END IF;
  IF item.track_batches AND p_batch IS NULL THEN RAISE EXCEPTION 'batch required'; END IF;
  amt := round(p_qty * p_rate, 2);
  IF amt = 0 THEN RAISE EXCEPTION 'zero-value receipt rejected'; END IF;
  INSERT INTO inventory_ledger.documents(doc_type, doc_number, doc_date, idempotency_key, source_ref)
  VALUES ('receipt', p_doc_number, p_doc_date, p_idempotency, p_source) RETURNING id INTO doc;
  INSERT INTO inventory_ledger.movements(document_id, item_id, godown_id, batch_id, direction, movement_type, qty, rate, amount)
  VALUES (doc, p_item, p_godown, p_batch, 'in', 'purchase', p_qty, p_rate, amt);
  bal := inventory_ledger._balance_key(p_item, p_godown, p_batch);
  UPDATE inventory_ledger.balances
  SET qty = qty + p_qty, value = value + amt
  WHERE item_id = p_item AND godown_id = p_godown AND batch_id IS NOT DISTINCT FROM p_batch;
  INSERT INTO inventory_ledger.audit_events(document_id, event) VALUES (doc, 'posted_receipt');
  RETURN doc;
END;
$$;

CREATE OR REPLACE FUNCTION inventory_ledger.post_issue(
  p_item uuid, p_godown uuid, p_qty numeric,
  p_doc_number text, p_doc_date date, p_idempotency text,
  p_batch uuid DEFAULT NULL, p_source text DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  existing uuid;
  doc uuid;
  bal inventory_ledger.balances;
  item inventory_ledger.items;
  avg numeric(18,6);
  amt numeric(18,2);
BEGIN
  IF p_idempotency IS NOT NULL THEN
    SELECT id INTO existing FROM inventory_ledger.documents WHERE idempotency_key = p_idempotency;
    IF existing IS NOT NULL THEN RETURN existing; END IF;
  END IF;
  SELECT * INTO item FROM inventory_ledger.items WHERE id = p_item AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'inactive or missing item'; END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'issue qty must be positive'; END IF;
  IF item.track_batches AND p_batch IS NULL THEN RAISE EXCEPTION 'batch required'; END IF;
  bal := inventory_ledger._balance_key(p_item, p_godown, p_batch);
  IF NOT item.allow_negative AND inventory_ledger.available(p_item, p_godown, p_batch) < p_qty THEN
    RAISE EXCEPTION 'negative stock blocked';
  END IF;
  IF bal.qty = 0 THEN RAISE EXCEPTION 'cannot value an issue from a zero balance'; END IF;
  avg := round(bal.value / bal.qty, 6);
  amt := round(p_qty * avg, 2);
  IF amt = 0 THEN RAISE EXCEPTION 'zero-value issue rejected'; END IF;
  INSERT INTO inventory_ledger.documents(doc_type, doc_number, doc_date, idempotency_key, source_ref, narration)
  VALUES ('issue', p_doc_number, p_doc_date, p_idempotency, p_source, p_reason) RETURNING id INTO doc;
  INSERT INTO inventory_ledger.movements(document_id, item_id, godown_id, batch_id, direction, movement_type, qty, rate, amount)
  VALUES (doc, p_item, p_godown, p_batch, 'out', 'sale', p_qty, avg, amt);
  UPDATE inventory_ledger.balances
  SET qty = qty - p_qty, value = value - amt
  WHERE item_id = p_item AND godown_id = p_godown AND batch_id IS NOT DISTINCT FROM p_batch;
  INSERT INTO inventory_ledger.audit_events(document_id, event, reason) VALUES (doc, 'posted_issue', p_reason);
  RETURN doc;
END;
$$;

CREATE OR REPLACE FUNCTION inventory_ledger.reserve_stock(
  p_item uuid, p_godown uuid, p_qty numeric, p_source text, p_idempotency text, p_batch uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; res uuid;
BEGIN
  SELECT id INTO existing FROM inventory_ledger.reservations WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF inventory_ledger.available(p_item, p_godown, p_batch) < p_qty THEN
    RAISE EXCEPTION 'insufficient available stock to reserve';
  END IF;
  INSERT INTO inventory_ledger.reservations(item_id, godown_id, batch_id, qty, source_ref, idempotency_key)
  VALUES (p_item, p_godown, p_batch, p_qty, p_source, p_idempotency) RETURNING id INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION inventory_ledger.release_reservation(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE inventory_ledger.reservations SET status = 'released' WHERE id = p_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'open reservation not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION inventory_ledger.post_transfer(
  p_item uuid, p_from uuid, p_to uuid, p_qty numeric,
  p_doc_number text, p_doc_date date, p_idempotency text, p_batch uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; doc uuid; bal inventory_ledger.balances; avg numeric(18,6); amt numeric(18,2);
BEGIN
  IF p_from = p_to THEN RAISE EXCEPTION 'transfer godowns must differ'; END IF;
  SELECT id INTO existing FROM inventory_ledger.documents WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  bal := inventory_ledger._balance_key(p_item, p_from, p_batch);
  IF inventory_ledger.available(p_item, p_from, p_batch) < p_qty THEN RAISE EXCEPTION 'negative stock blocked'; END IF;
  avg := round(bal.value / NULLIF(bal.qty, 0), 6);
  amt := round(p_qty * avg, 2);
  IF amt = 0 THEN RAISE EXCEPTION 'zero-value transfer rejected'; END IF;
  INSERT INTO inventory_ledger.documents(doc_type, doc_number, doc_date, idempotency_key)
  VALUES ('transfer', p_doc_number, p_doc_date, p_idempotency) RETURNING id INTO doc;
  INSERT INTO inventory_ledger.movements(document_id, item_id, godown_id, batch_id, direction, movement_type, qty, rate, amount)
  VALUES
    (doc, p_item, p_from, p_batch, 'out', 'transfer_out', p_qty, avg, amt),
    (doc, p_item, p_to, p_batch, 'in', 'transfer_in', p_qty, avg, amt);
  UPDATE inventory_ledger.balances SET qty = qty - p_qty, value = value - amt
  WHERE item_id = p_item AND godown_id = p_from AND batch_id IS NOT DISTINCT FROM p_batch;
  PERFORM inventory_ledger._balance_key(p_item, p_to, p_batch);
  UPDATE inventory_ledger.balances SET qty = qty + p_qty, value = value + amt
  WHERE item_id = p_item AND godown_id = p_to AND batch_id IS NOT DISTINCT FROM p_batch;
  RETURN doc;
END;
$$;

CREATE OR REPLACE FUNCTION inventory_ledger.post_production(
  p_bom uuid, p_fg_qty numeric, p_godown uuid,
  p_doc_number text, p_doc_date date, p_idempotency text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  existing uuid; doc uuid; bom inventory_ledger.boms; line record;
  bal inventory_ledger.balances; avg numeric(18,6); amt numeric(18,2);
  need numeric(18,4); total numeric(18,2) := 0; fg_rate numeric(18,6);
BEGIN
  SELECT id INTO existing FROM inventory_ledger.documents WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  SELECT * INTO bom FROM inventory_ledger.boms WHERE id = p_bom AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'active bom required'; END IF;
  IF p_fg_qty <= 0 THEN RAISE EXCEPTION 'finished qty must be positive'; END IF;
  INSERT INTO inventory_ledger.documents(doc_type, doc_number, doc_date, idempotency_key, source_ref)
  VALUES ('production', p_doc_number, p_doc_date, p_idempotency, p_bom::text) RETURNING id INTO doc;
  FOR line IN SELECT * FROM inventory_ledger.bom_lines WHERE bom_id = p_bom LOOP
    need := round(line.qty_per * p_fg_qty, 4);
    bal := inventory_ledger._balance_key(line.component_item_id, p_godown, NULL);
    IF inventory_ledger.available(line.component_item_id, p_godown, NULL) < need THEN
      RAISE EXCEPTION 'negative stock blocked for component %', line.component_item_id;
    END IF;
    avg := round(bal.value / NULLIF(bal.qty, 0), 6);
    amt := round(need * avg, 2);
    IF amt = 0 THEN RAISE EXCEPTION 'zero-value production issue rejected'; END IF;
    INSERT INTO inventory_ledger.movements(document_id, item_id, godown_id, direction, movement_type, qty, rate, amount)
    VALUES (doc, line.component_item_id, p_godown, 'out', 'production_out', need, avg, amt);
    UPDATE inventory_ledger.balances SET qty = qty - need, value = value - amt
    WHERE item_id = line.component_item_id AND godown_id = p_godown AND batch_id IS NULL;
    total := total + amt;
  END LOOP;
  fg_rate := round(total / p_fg_qty, 6);
  INSERT INTO inventory_ledger.movements(document_id, item_id, godown_id, direction, movement_type, qty, rate, amount)
  VALUES (doc, bom.finished_item_id, p_godown, 'in', 'production_in', p_fg_qty, fg_rate, total);
  PERFORM inventory_ledger._balance_key(bom.finished_item_id, p_godown, NULL);
  UPDATE inventory_ledger.balances SET qty = qty + p_fg_qty, value = value + total
  WHERE item_id = bom.finished_item_id AND godown_id = p_godown AND batch_id IS NULL;
  INSERT INTO inventory_ledger.audit_events(document_id, event) VALUES (doc, 'posted_production');
  RETURN doc;
END;
$$;

CREATE OR REPLACE FUNCTION inventory_ledger.reverse_document(p_doc uuid, p_reason text, p_date date, p_idempotency text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE existing uuid; rev uuid; src inventory_ledger.documents; mv record; signed numeric;
BEGIN
  SELECT id INTO existing FROM inventory_ledger.documents WHERE idempotency_key = p_idempotency;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  SELECT * INTO src FROM inventory_ledger.documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND OR src.status <> 'posted' OR src.doc_type = 'reversal' THEN
    RAISE EXCEPTION 'only a posted source document can be reversed';
  END IF;
  INSERT INTO inventory_ledger.documents(doc_type, doc_number, doc_date, idempotency_key, reverses, narration)
  VALUES ('reversal', src.doc_number || '-REV', p_date, p_idempotency, p_doc, p_reason) RETURNING id INTO rev;
  FOR mv IN SELECT * FROM inventory_ledger.movements WHERE document_id = p_doc LOOP
    signed := CASE WHEN mv.direction = 'in' THEN -1 ELSE 1 END;
    INSERT INTO inventory_ledger.movements(document_id, item_id, godown_id, batch_id, direction, movement_type, qty, rate, amount)
    VALUES (rev, mv.item_id, mv.godown_id, mv.batch_id, CASE WHEN mv.direction = 'in' THEN 'out' ELSE 'in' END,
            'reversal', mv.qty, mv.rate, mv.amount);
    PERFORM inventory_ledger._balance_key(mv.item_id, mv.godown_id, mv.batch_id);
    UPDATE inventory_ledger.balances
    SET qty = qty + signed * mv.qty, value = value + signed * mv.amount
    WHERE item_id = mv.item_id AND godown_id = mv.godown_id AND batch_id IS NOT DISTINCT FROM mv.batch_id;
  END LOOP;
  UPDATE inventory_ledger.documents SET status = 'reversed', reversed_by = rev WHERE id = p_doc;
  INSERT INTO inventory_ledger.audit_events(document_id, event, reason) VALUES (rev, 'reversed', p_reason);
  RETURN rev;
END;
$$;
