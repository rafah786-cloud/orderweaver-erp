-- Sales order request, label handoff, and durable production print queue.
-- Deliberately additive: this migration does not post accounting, reserve stock, or dispatch orders.

ALTER TABLE public.product_models
  ADD COLUMN IF NOT EXISTS label_product_kind text NOT NULL DEFAULT 'unclassified';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.product_models'::regclass
      AND conname = 'product_models_label_product_kind_check'
  ) THEN
    ALTER TABLE public.product_models
      ADD CONSTRAINT product_models_label_product_kind_check
      CHECK (label_product_kind IN ('mattress', 'non_mattress', 'unclassified'));
  END IF;
END $$;

-- Sales requests are a separate workflow. A request is not a sales order,
-- has no stock/accounting side effects, and can be converted only once.
CREATE TABLE IF NOT EXISTS public.sales_order_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  request_number text NOT NULL,
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  requested_delivery date,
  notes text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'converted', 'rejected', 'cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creation_idempotency_key text NOT NULL,
  converted_sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, request_number),
  UNIQUE (company_id, created_by, creation_idempotency_key),
  UNIQUE (converted_sales_order_id),
  CHECK (
    (status = 'converted' AND converted_sales_order_id IS NOT NULL AND converted_at IS NOT NULL)
    OR status <> 'converted'
  )
);

CREATE TABLE IF NOT EXISTS public.sales_order_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL REFERENCES public.sales_order_requests(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.product_models(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  size text,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  suggested_unit_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (suggested_unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(product_name)) > 0)
);
CREATE INDEX IF NOT EXISTS sales_order_requests_company_status_created
  ON public.sales_order_requests(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_order_request_items_request
  ON public.sales_order_request_items(company_id, request_id);

ALTER TABLE public.sales_order_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_request_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_requests, public.sales_order_request_items FROM anon, authenticated;
GRANT SELECT ON public.sales_order_requests, public.sales_order_request_items TO authenticated;

DROP POLICY IF EXISTS sales_order_requests_company_read ON public.sales_order_requests;
CREATE POLICY sales_order_requests_company_read ON public.sales_order_requests
  FOR SELECT TO authenticated USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'accountant')
      OR (public.has_role(auth.uid(), 'sales') AND created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS sales_order_request_items_company_read ON public.sales_order_request_items;
CREATE POLICY sales_order_request_items_company_read ON public.sales_order_request_items
  FOR SELECT TO authenticated USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND EXISTS (
      SELECT 1 FROM public.sales_order_requests r
      WHERE r.id = request_id AND r.company_id = sales_order_request_items.company_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'accountant')
          OR (public.has_role(auth.uid(), 'sales') AND r.created_by = auth.uid())
        )
    )
  );

-- Accounts needs scoped reads to create an order from a submitted request.
DROP POLICY IF EXISTS parties_accounts_read ON public.parties;
CREATE POLICY parties_accounts_read ON public.parties
  FOR SELECT TO authenticated USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND public.has_role(auth.uid(), 'accountant')
  );
DROP POLICY IF EXISTS product_models_accounts_read ON public.product_models;
CREATE POLICY product_models_accounts_read ON public.product_models
  FOR SELECT TO authenticated USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND public.has_role(auth.uid(), 'accountant')
  );
DROP POLICY IF EXISTS sales_orders_accounts_read ON public.sales_orders;
CREATE POLICY sales_orders_accounts_read ON public.sales_orders
  FOR SELECT TO authenticated USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND public.has_role(auth.uid(), 'accountant')
  );
DROP POLICY IF EXISTS sales_order_items_accounts_read ON public.sales_order_items;
CREATE POLICY sales_order_items_accounts_read ON public.sales_order_items
  FOR SELECT TO authenticated USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND public.has_role(auth.uid(), 'accountant')
  );

CREATE OR REPLACE FUNCTION public.create_sales_order_request_atomic(
  p_party_id uuid,
  p_requested_delivery date,
  p_notes text,
  p_idempotency_key text,
  p_lines jsonb
)
RETURNS TABLE(id uuid, request_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_request uuid;
  v_number text;
  v_line jsonb;
  v_model record;
  v_qty numeric;
  v_count integer;
BEGIN
  IF v_company IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication and active company are required';
  END IF;
  IF NOT (public.has_role(v_user, 'admin') OR public.has_role(v_user, 'sales')) THEN
    RAISE EXCEPTION 'Sales access required';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Idempotency key required';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
      OR jsonb_array_length(p_lines) < 1 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'Provide between 1 and 200 request lines';
  END IF;

  SELECT r.id, r.request_number INTO v_request, v_number
  FROM public.sales_order_requests r
  WHERE r.company_id = v_company AND r.created_by = v_user
    AND r.creation_idempotency_key = p_idempotency_key
  LIMIT 1;
  IF v_request IS NOT NULL THEN
    RETURN QUERY SELECT v_request, v_number;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.parties p WHERE p.id = p_party_id AND p.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Customer is outside the active company';
  END IF;

  v_number := 'SOR-' || to_char(clock_timestamp(), 'YYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.sales_order_requests (
    company_id, request_number, party_id, requested_delivery, notes, status,
    created_by, creation_idempotency_key
  )
  VALUES (
    v_company, v_number, p_party_id, p_requested_delivery, NULLIF(btrim(p_notes), ''),
    'submitted', v_user, p_idempotency_key
  )
  RETURNING public.sales_order_requests.id INTO v_request;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF NULLIF(btrim(v_line->>'model_id'), '') IS NULL THEN
      RAISE EXCEPTION 'Each request line must select a product model';
    END IF;
    BEGIN
      v_qty := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Request quantity must be numeric';
    END;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Request quantity must be greater than zero';
    END IF;

    SELECT m.id, m.name, m.size, m.default_price
      INTO v_model
    FROM public.product_models m
    WHERE m.id = (v_line->>'model_id')::uuid AND m.company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A product model is outside the active company';
    END IF;

    INSERT INTO public.sales_order_request_items (
      company_id, request_id, model_id, product_name, size, quantity, suggested_unit_price
    )
    VALUES (
      v_company, v_request, v_model.id, v_model.name, v_model.size, v_qty,
      GREATEST(COALESCE(v_model.default_price, 0), 0)
    );
  END LOOP;

  SELECT count(*) INTO v_count
  FROM public.sales_order_request_items i
  WHERE i.request_id = v_request AND i.company_id = v_company;
  IF v_count = 0 THEN RAISE EXCEPTION 'Request has no valid product lines'; END IF;

  RETURN QUERY SELECT v_request, v_number;
END;
$$;
REVOKE ALL ON FUNCTION public.create_sales_order_request_atomic(uuid,date,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order_request_atomic(uuid,date,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_sales_order_request_atomic(
  p_request_id uuid,
  p_order_date date,
  p_expected_delivery date,
  p_notes text,
  p_idempotency_key text,
  p_prices jsonb
)
RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_request public.sales_order_requests%ROWTYPE;
  v_line public.sales_order_request_items%ROWTYPE;
  v_price_entry jsonb;
  v_price numeric;
  v_total numeric := 0;
  v_order uuid;
  v_order_no text;
  v_next bigint;
  v_count integer;
  v_seen integer := 0;
BEGIN
  IF v_company IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication and active company are required';
  END IF;
  IF NOT (public.has_role(v_user, 'admin') OR public.has_role(v_user, 'accountant')) THEN
    RAISE EXCEPTION 'Accounts access required to convert a request';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Idempotency key required';
  END IF;

  SELECT so.id, so.order_number INTO v_order, v_order_no
  FROM public.sales_orders so
  WHERE so.company_id = v_company AND so.creation_idempotency_key = p_idempotency_key
  LIMIT 1;
  IF v_order IS NOT NULL THEN
    RETURN QUERY SELECT v_order, v_order_no;
    RETURN;
  END IF;

  SELECT r.* INTO v_request
  FROM public.sales_order_requests r
  WHERE r.id = p_request_id AND r.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order request not found'; END IF;
  IF v_request.status = 'converted' AND v_request.converted_sales_order_id IS NOT NULL THEN
    SELECT so.id, so.order_number INTO v_order, v_order_no
    FROM public.sales_orders so
    WHERE so.id = v_request.converted_sales_order_id AND so.company_id = v_company;
    IF v_order IS NULL THEN RAISE EXCEPTION 'Converted sales order is unavailable'; END IF;
    RETURN QUERY SELECT v_order, v_order_no;
    RETURN;
  END IF;
  IF v_request.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted requests can be converted';
  END IF;
  IF p_prices IS NULL OR jsonb_typeof(p_prices) <> 'array' THEN
    RAISE EXCEPTION 'Line prices are required';
  END IF;

  SELECT count(*) INTO v_count FROM public.sales_order_request_items i
  WHERE i.request_id = p_request_id AND i.company_id = v_company;
  IF v_count < 1 OR v_count > 200 OR jsonb_array_length(p_prices) <> v_count THEN
    RAISE EXCEPTION 'The conversion prices do not match the saved request lines';
  END IF;

  FOR v_line IN
    SELECT i.* FROM public.sales_order_request_items i
    WHERE i.request_id = p_request_id AND i.company_id = v_company ORDER BY i.created_at, i.id
  LOOP
    SELECT p.value INTO v_price_entry
    FROM jsonb_array_elements(p_prices) p(value)
    WHERE p.value->>'request_line_id' = v_line.id::text
    LIMIT 1;
    IF v_price_entry IS NULL THEN RAISE EXCEPTION 'A request line is missing its price'; END IF;
    BEGIN
      v_price := (v_price_entry->>'unit_price')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Line price must be numeric';
    END;
    IF v_price IS NULL OR v_price < 0 THEN RAISE EXCEPTION 'Line price cannot be negative'; END IF;
    v_total := v_total + round(v_line.quantity * v_price, 2);
    v_seen := v_seen + 1;
  END LOOP;
  IF v_seen <> v_count OR v_total <= 0 THEN
    RAISE EXCEPTION 'Sales order total must be greater than zero';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sales-order-number:' || v_company::text, 0));
  SELECT COALESCE(max(NULLIF(regexp_replace(so.order_number, '[^0-9]', '', 'g'), '')::bigint), 0) + 1
    INTO v_next
  FROM public.sales_orders so WHERE so.company_id = v_company;
  v_order_no := 'SO-' || lpad(v_next::text, 8, '0');

  INSERT INTO public.sales_orders (
    company_id, order_number, party_id, order_date, expected_delivery, total_amount,
    notes, created_by, creation_idempotency_key
  )
  VALUES (
    v_company, v_order_no, v_request.party_id, COALESCE(p_order_date, CURRENT_DATE),
    COALESCE(p_expected_delivery, v_request.requested_delivery),
    round(v_total, 2), COALESCE(NULLIF(btrim(p_notes), ''), v_request.notes),
    v_user, p_idempotency_key
  )
  RETURNING public.sales_orders.id INTO v_order;

  FOR v_line IN
    SELECT i.* FROM public.sales_order_request_items i
    WHERE i.request_id = p_request_id AND i.company_id = v_company ORDER BY i.created_at, i.id
  LOOP
    SELECT p.value INTO v_price_entry
    FROM jsonb_array_elements(p_prices) p(value)
    WHERE p.value->>'request_line_id' = v_line.id::text LIMIT 1;
    v_price := (v_price_entry->>'unit_price')::numeric;
    INSERT INTO public.sales_order_items (
      company_id, sales_order_id, model_id, product_name, size, quantity, unit_price
    )
    VALUES (
      v_company, v_order, v_line.model_id, v_line.product_name, v_line.size, v_line.quantity, v_price
    );
  END LOOP;

  UPDATE public.sales_order_requests
  SET status = 'converted', converted_sales_order_id = v_order, converted_at = now(), updated_at = now()
  WHERE id = p_request_id AND company_id = v_company;

  RETURN QUERY SELECT v_order, v_order_no;
END;
$$;
REVOKE ALL ON FUNCTION public.convert_sales_order_request_atomic(uuid,date,date,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_sales_order_request_atomic(uuid,date,date,text,text,jsonb) TO authenticated;

-- Device credentials are hashed at rest. The raw pairing token is returned once by an
-- authenticated admin server function and is never exposed through a SELECT policy.
CREATE TABLE IF NOT EXISTS public.production_print_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.production_print_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_print_devices FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.production_print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN ('sales_order_receipt', 'sales_order_receipt_reprint')),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  parent_job_id uuid REFERENCES public.production_print_jobs(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'spooled', 'failed', 'needs_review')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  device_id uuid REFERENCES public.production_print_devices(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS production_print_jobs_queue_idx
  ON public.production_print_jobs(company_id, status, created_at)
  WHERE status = 'queued';
ALTER TABLE public.production_print_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_print_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_print_jobs TO authenticated;

DROP POLICY IF EXISTS production_print_jobs_company_read ON public.production_print_jobs;
CREATE POLICY production_print_jobs_company_read ON public.production_print_jobs
  FOR SELECT TO authenticated USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production'))
  );

-- One-time, expiring tokens bridge the ERP to Smart Label Creator without putting customer
-- data into a URL or allowing unauthenticated callers to query sales orders.
CREATE TABLE IF NOT EXISTS public.label_handoff_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, sales_order_id)
);
CREATE INDEX IF NOT EXISTS label_handoff_jobs_expiry_idx ON public.label_handoff_jobs(expires_at);
ALTER TABLE public.label_handoff_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.label_handoff_jobs FROM PUBLIC, anon, authenticated;

-- Every Sales Order gets exactly one durable initial receipt job in the same database
-- transaction. A deferred trigger sees the completed order lines, not a partial header.
CREATE OR REPLACE FUNCTION public.enqueue_sales_order_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_customer text;
  v_items jsonb;
BEGIN
  SELECT so.* INTO v_order
  FROM public.sales_orders so WHERE so.id = NEW.id;
  IF NOT FOUND OR v_order.company_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.name INTO v_customer
  FROM public.parties p
  WHERE p.id = v_order.party_id AND p.company_id = v_order.company_id;
  IF v_customer IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('item', i.product_name, 'quantity', i.quantity)
      ORDER BY i.id
    ), '[]'::jsonb
  ) INTO v_items
  FROM public.sales_order_items i
  WHERE i.sales_order_id = v_order.id AND i.company_id = v_order.company_id;

  INSERT INTO public.production_print_jobs (
    company_id, job_type, sales_order_id, idempotency_key, payload
  )
  VALUES (
    v_order.company_id, 'sales_order_receipt', v_order.id,
    'sales-order-receipt:' || v_order.id::text,
    jsonb_build_object(
      'customerName', v_customer,
      'orderNumber', v_order.order_number,
      'items', v_items
    )
  )
  ON CONFLICT (company_id, idempotency_key) DO NOTHING;

  -- An in-app production alert is transactional with the saved Sales Order.
  INSERT INTO public.in_app_notifications (
    user_id, event_key, title, body, ref_table, ref_id, link, payload
  )
  SELECT DISTINCT ur.user_id, 'staff.sales_order.created', 'New Sales Order',
    'Sales Order ' || v_order.order_number || ' is ready for production. Receipt queued.',
    'sales_orders', v_order.id, '/print-bridge',
    jsonb_build_object('order_number', v_order.order_number)
  FROM public.user_roles ur
  JOIN public.profiles pr ON pr.id = ur.user_id AND pr.status = 'approved'
  JOIN public.user_company_access uca ON uca.user_id = ur.user_id
    AND uca.company_id = v_order.company_id AND uca.can_view = true
  WHERE ur.role::text IN ('admin', 'production');

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sales_order_receipt_queue_deferred ON public.sales_orders;
CREATE CONSTRAINT TRIGGER sales_order_receipt_queue_deferred
AFTER INSERT ON public.sales_orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enqueue_sales_order_receipt();

-- A request cannot be missed in the Accounts inbox even if its mobile browser closes
-- immediately after submission.
CREATE OR REPLACE FUNCTION public.notify_accounts_sales_order_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer text;
BEGIN
  SELECT p.name INTO v_customer
  FROM public.parties p
  WHERE p.id = NEW.party_id AND p.company_id = NEW.company_id;
  IF v_customer IS NULL THEN v_customer := 'Customer'; END IF;

  INSERT INTO public.in_app_notifications (
    user_id, event_key, title, body, ref_table, ref_id, link, payload
  )
  SELECT DISTINCT ur.user_id, 'staff.sales_order_request.created', 'New Customer Order Request',
    'Request ' || NEW.request_number || ' from ' || v_customer || ' is waiting for Accounts.',
    'sales_order_requests', NEW.id, '/order-requests',
    jsonb_build_object('request_number', NEW.request_number, 'customer_name', v_customer)
  FROM public.user_roles ur
  JOIN public.profiles pr ON pr.id = ur.user_id AND pr.status = 'approved'
  JOIN public.user_company_access uca ON uca.user_id = ur.user_id
    AND uca.company_id = NEW.company_id AND uca.can_view = true
  WHERE ur.role::text IN ('admin', 'accountant');

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sales_order_request_accounts_notification ON public.sales_order_requests;
CREATE TRIGGER sales_order_request_accounts_notification
AFTER INSERT ON public.sales_order_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_accounts_sales_order_request();

-- The bridge can only claim jobs with a valid active company device token. SKIP LOCKED
-- prevents two polling agents from claiming the same job simultaneously.
CREATE OR REPLACE FUNCTION public.claim_production_print_job(p_device_id uuid, p_token_hash text)
RETURNS TABLE(id uuid, company_id uuid, sales_order_id uuid, payload jsonb, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT d.company_id INTO v_company
  FROM public.production_print_devices d
  WHERE d.id = p_device_id AND d.token_hash = p_token_hash AND d.is_active = true;
  IF v_company IS NULL THEN RETURN; END IF;

  UPDATE public.production_print_devices AS device_row
  SET last_seen_at = now()
  WHERE device_row.id = p_device_id AND device_row.company_id = v_company;

  -- A crashed or disconnected agent must not leave a job claimed forever.
  -- Expired claims move to manual inspection, never directly back to queued,
  -- because the OS may have accepted the slip just before the agent stopped.
  UPDATE public.production_print_jobs
  SET status = 'needs_review',
      last_error = 'The printer agent did not acknowledge this claim within five minutes. Inspect the Windows queue and physical output before reprinting.',
      updated_at = now()
  WHERE company_id = v_company
    AND status = 'claimed'
    AND claimed_at < now() - interval '5 minutes';

  RETURN QUERY
  WITH candidate AS (
    SELECT j.id
    FROM public.production_print_jobs j
    WHERE j.company_id = v_company AND j.status = 'queued'
    ORDER BY j.created_at, j.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.production_print_jobs j
  SET status = 'claimed', device_id = p_device_id, claimed_at = now(),
      attempts = j.attempts + 1, updated_at = now(), last_error = NULL
  FROM candidate c
  WHERE j.id = c.id
  RETURNING j.id, j.company_id, j.sales_order_id, j.payload, j.attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_production_print_job(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_production_print_job(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_production_print_job(p_job_id uuid, p_force_review boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_job public.production_print_jobs%ROWTYPE;
  v_new_job uuid;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL
    OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production')) THEN
    RAISE EXCEPTION 'Production print access required';
  END IF;
  SELECT j.* INTO v_job
  FROM public.production_print_jobs j
  WHERE j.id = p_job_id AND j.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Print job not found'; END IF;
  IF v_job.status IN ('needs_review', 'spooled') AND NOT p_force_review THEN
    RAISE EXCEPTION 'This job may already have printed; inspect physical output before reprinting';
  END IF;
  IF v_job.status NOT IN ('failed', 'needs_review', 'spooled') THEN
    RAISE EXCEPTION 'Only failed, review-required, or explicitly selected completed jobs can be reprinted';
  END IF;

  INSERT INTO public.production_print_jobs (
    company_id, job_type, sales_order_id, parent_job_id, idempotency_key, payload
  )
  VALUES (
    v_company, 'sales_order_receipt_reprint', v_job.sales_order_id, v_job.id,
    'manual-reprint:' || v_job.id::text || ':' || replace(gen_random_uuid()::text, '-', ''),
    v_job.payload
  )
  RETURNING id INTO v_new_job;
  RETURN v_new_job;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_production_print_job(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_production_print_job(uuid,boolean) TO authenticated;

-- Do not create notification-delivery settings or enable external channels here. In-app
-- notifications and the durable queue are the safe, working baseline; other channels
-- remain under the existing admin-controlled notification configuration.
