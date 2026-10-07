BEGIN;

-- Durable Tally incremental-sync control plane.
-- This stores source identity, per-record-type Alter ID watermarks, immutable
-- accepted batches, and replayable rows. It deliberately does NOT implement
-- a Tally query/filter expression: that must remain tied to a verified Tally
-- integration definition.

CREATE TABLE IF NOT EXISTS public.tally_sync_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_company_guid text,
  source_company_name text,
  connector_id text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','blocked')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tally_sync_source_company_connector
  ON public.tally_sync_sources(company_id, connector_id);

CREATE TABLE IF NOT EXISTS public.tally_sync_watermarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.tally_sync_sources(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  last_alter_id bigint NOT NULL DEFAULT 0 CHECK (last_alter_id >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, record_type)
);

CREATE TABLE IF NOT EXISTS public.tally_sync_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.tally_sync_sources(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  previous_alter_id bigint NOT NULL CHECK (previous_alter_id >= 0),
  new_alter_id bigint NOT NULL CHECK (new_alter_id >= previous_alter_id),
  row_count integer NOT NULL CHECK (row_count > 0),
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted','processing','applied','failed','dead_letter')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  last_error text,
  UNIQUE(source_id, record_type, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_tally_sync_batches_company_created
  ON public.tally_sync_batches(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tally_sync_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.tally_sync_batches(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.tally_sync_sources(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  alter_id bigint NOT NULL CHECK (alter_id > 0),
  source_id_value text,
  source_key text NOT NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'posted'
    CHECK (lifecycle_state IN ('posted','cancelled','optional','deleted')),
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','applied','failed','dead_letter')),
  canonical_id uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, record_type, alter_id),
  UNIQUE(source_id, record_type, source_key)
);

CREATE INDEX IF NOT EXISTS idx_tally_sync_rows_pending
  ON public.tally_sync_rows(company_id, processing_status, created_at);

CREATE TABLE IF NOT EXISTS public.tally_sync_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id uuid NOT NULL REFERENCES public.tally_sync_rows(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  error_code text NOT NULL,
  error_message text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.tally_sync_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_watermarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_dead_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tally sync sources company scope" ON public.tally_sync_sources;
CREATE POLICY "tally sync sources company scope"
  ON public.tally_sync_sources AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "tally sync watermarks company scope" ON public.tally_sync_watermarks;
CREATE POLICY "tally sync watermarks company scope"
  ON public.tally_sync_watermarks AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tally_sync_sources s
    WHERE s.id=source_id
      AND s.company_id=public.current_company_id()
      AND public.has_company_access(s.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tally_sync_sources s
    WHERE s.id=source_id
      AND s.company_id=public.current_company_id()
      AND public.has_company_access(s.company_id)
  ));

DROP POLICY IF EXISTS "tally sync batches company scope" ON public.tally_sync_batches;
CREATE POLICY "tally sync batches company scope"
  ON public.tally_sync_batches AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "tally sync rows company scope" ON public.tally_sync_rows;
CREATE POLICY "tally sync rows company scope"
  ON public.tally_sync_rows AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "tally sync dead letters company scope" ON public.tally_sync_dead_letters;
CREATE POLICY "tally sync dead letters company scope"
  ON public.tally_sync_dead_letters AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

CREATE OR REPLACE FUNCTION public.accept_tally_sync_batch(
  p_source_id uuid,
  p_record_type text,
  p_previous_alter_id text,
  p_new_alter_id text,
  p_payload_hash text,
  p_rows jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.tally_sync_sources%ROWTYPE;
  wm public.tally_sync_watermarks%ROWTYPE;
  batch_id uuid;
  item jsonb;
  aid bigint;
  source_key text;
  source_id_value text;
  lifecycle text;
  payload jsonb;
  payload_hash text;
  seen jsonb := '{}'::jsonb;
  row_count integer;
  previous_aid bigint;
  new_aid bigint;
BEGIN
  previous_aid := NULLIF(btrim(p_previous_alter_id),'')::bigint;
  new_aid := NULLIF(btrim(p_new_alter_id),'')::bigint;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_record_type IS NULL OR btrim(p_record_type)='' THEN
    RAISE EXCEPTION 'record_type is required';
  END IF;
  IF previous_aid IS NULL OR new_aid IS NULL OR previous_aid < 0 OR new_aid < previous_aid THEN
    RAISE EXCEPTION 'Invalid Alter ID range';
  END IF;
  IF p_payload_hash IS NULL OR length(btrim(p_payload_hash)) < 16 THEN
    RAISE EXCEPTION 'payload_hash is required';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows)=0 THEN
    RAISE EXCEPTION 'A non-empty row array is required';
  END IF;

  SELECT * INTO src
  FROM public.tally_sync_sources
  WHERE id=p_source_id
  FOR UPDATE;

  IF src.id IS NULL THEN
    RAISE EXCEPTION 'Unknown Tally sync source';
  END IF;
  IF src.status <> 'active' THEN
    RAISE EXCEPTION 'Tally sync source is not active';
  END IF;
  IF NOT public.has_company_access(src.company_id) OR src.company_id <> public.current_company_id() THEN
    RAISE EXCEPTION 'Tally sync source is outside the active company';
  END IF;

  SELECT * INTO wm
  FROM public.tally_sync_watermarks
  WHERE source_id=p_source_id AND record_type=p_record_type
  FOR UPDATE;

  IF wm.id IS NULL THEN
    INSERT INTO public.tally_sync_watermarks(source_id,record_type,last_alter_id)
    VALUES (p_source_id,p_record_type,0)
    RETURNING * INTO wm;
  END IF;

  -- Optimistic concurrency: a batch is accepted only against the watermark
  -- that the connector actually read. This prevents two connector workers
  -- from advancing the same stream independently.
  IF wm.last_alter_id <> p_previous_alter_id THEN
    RAISE EXCEPTION 'Watermark conflict: expected %, current %',
      p_previous_alter_id, wm.last_alter_id;
  END IF;

  IF new_aid <= previous_aid THEN
    RAISE EXCEPTION 'New Alter ID must advance the watermark';
  END IF;

  SELECT id INTO batch_id
  FROM public.tally_sync_batches
  WHERE source_id=p_source_id
    AND record_type=p_record_type
    AND payload_hash=p_payload_hash;

  IF batch_id IS NOT NULL THEN
    RETURN batch_id;
  END IF;

  row_count := jsonb_array_length(p_rows);

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    aid := NULLIF(btrim(item->>'alter_id'),'')::bigint;
    source_key := btrim(item->>'source_key');
    source_id_value := NULLIF(btrim(item->>'source_id'),'');
    lifecycle := COALESCE(NULLIF(btrim(item->>'lifecycle_state'),''),'posted');
    payload := item->'payload';
    payload_hash := NULLIF(btrim(item->>'payload_hash'),'');

    IF aid IS NULL OR aid <= previous_aid OR aid > new_aid THEN
      RAISE EXCEPTION 'Row Alter ID % is outside accepted range', item->>'alter_id';
    END IF;
    IF source_key IS NULL OR source_key='' THEN
      RAISE EXCEPTION 'Every sync row requires source_key';
    END IF;
    IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
      RAISE EXCEPTION 'Every sync row requires an object payload';
    END IF;
    IF lifecycle NOT IN ('posted','cancelled','optional','deleted') THEN
      RAISE EXCEPTION 'Invalid lifecycle_state %', lifecycle;
    END IF;

    -- Detect duplicate Alter IDs inside the same batch before writing anything.
    IF seen ? aid::text THEN
      RAISE EXCEPTION 'Duplicate Alter ID % in batch', aid;
    END IF;
    seen := seen || jsonb_build_object(aid::text,true);

    IF payload_hash IS NULL THEN
      RAISE EXCEPTION 'Every sync row requires payload_hash';
    END IF;
  END LOOP;

  INSERT INTO public.tally_sync_batches(
    source_id,company_id,record_type,previous_alter_id,new_alter_id,
    row_count,payload_hash,status
  )
  VALUES(
    p_source_id,src.company_id,p_record_type,previous_aid,new_aid,
    row_count,p_payload_hash,'accepted'
  )
  RETURNING id INTO batch_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.tally_sync_rows(
      batch_id,source_id,company_id,record_type,alter_id,source_id_value,
      source_key,payload_hash,payload,lifecycle_state
    )
    VALUES(
      batch_id,p_source_id,src.company_id,p_record_type,
      (item->>'alter_id')::bigint,
      NULLIF(btrim(item->>'source_id'),''),
      btrim(item->>'source_key'),
      btrim(item->>'payload_hash'),
      item->'payload',
      COALESCE(NULLIF(btrim(item->>'lifecycle_state'),''),'posted')
    );
  END LOOP;

  UPDATE public.tally_sync_watermarks
  SET last_alter_id=new_aid, updated_at=now()
  WHERE id=wm.id;

  UPDATE public.tally_sync_sources
  SET last_seen_at=now(), updated_at=now()
  WHERE id=p_source_id;

  RETURN batch_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Tally sync batch contains a duplicate source identity or Alter ID';
END;
$$;

REVOKE ALL ON FUNCTION public.accept_tally_sync_batch(uuid,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_tally_sync_batch(uuid,text,text,text,text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_tally_sync_batch(uuid,text,text,text,text,jsonb) TO authenticated;

COMMIT;
