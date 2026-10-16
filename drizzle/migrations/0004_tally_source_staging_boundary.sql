CREATE TABLE public.tally_source_staging_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_company text NOT NULL CHECK (source_company IN ('ABOOD TRADINGS','ABRAZ SLEEPING SOLUTIONS','ABZ - EST','ESTIMATE')),
  isolation_class text NOT NULL CHECK (isolation_class IN ('official_candidate','estimate_isolated')),
  source_company_guid text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_company, source_company_guid),
  CHECK ((source_company IN ('ABZ - EST','ESTIMATE')) = (isolation_class = 'estimate_isolated'))
);
COMMENT ON TABLE public.tally_source_staging_sources IS 'Staging-only Tally source identities. Never linked to companies/books; no posting.';
CREATE TABLE public.tally_source_staging_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.tally_source_staging_sources(id),
  chunk_name text NOT NULL,
  chunk_sha256 text NOT NULL CHECK (chunk_sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 250),
  normalization_version text NOT NULL,
  staged_by uuid NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, chunk_sha256)
);
CREATE TABLE public.tally_source_staging_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.tally_source_staging_sources(id),
  chunk_id uuid NOT NULL REFERENCES public.tally_source_staging_chunks(id),
  segment text,
  segment_sha256 text,
  message_no integer,
  idempotency_key text NOT NULL,
  row_sha256 text NOT NULL CHECK (row_sha256 ~ '^[a-f0-9]{64}$'),
  record_type text NOT NULL,
  source_guid text,
  alter_id text,
  master_id text,
  lifecycle_state text,
  is_duplicate boolean NOT NULL DEFAULT false,
  rejects jsonb NOT NULL DEFAULT '[]'::jsonb,
  normalization jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_message_xml text NOT NULL,
  normalized_message_xml text,
  payload jsonb,
  staged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, idempotency_key, row_sha256)
);
CREATE INDEX tally_source_staging_rows_source_type_idx ON public.tally_source_staging_rows (source_id, record_type);

GRANT SELECT, INSERT ON public.tally_source_staging_sources TO authenticated;
GRANT SELECT, INSERT ON public.tally_source_staging_chunks TO authenticated;
GRANT SELECT, INSERT ON public.tally_source_staging_rows TO authenticated;
GRANT ALL ON public.tally_source_staging_sources, public.tally_source_staging_chunks, public.tally_source_staging_rows TO service_role;

ALTER TABLE public.tally_source_staging_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_source_staging_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_source_staging_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY tss_admin_read ON public.tally_source_staging_sources FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND public.is_approved(auth.uid()));
CREATE POLICY tss_admin_insert ON public.tally_source_staging_sources FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND public.is_approved(auth.uid()) AND created_by = auth.uid());
CREATE POLICY tsc_admin_read ON public.tally_source_staging_chunks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND public.is_approved(auth.uid()));
CREATE POLICY tsc_admin_insert ON public.tally_source_staging_chunks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND public.is_approved(auth.uid()) AND staged_by = auth.uid());
CREATE POLICY tsr_admin_read ON public.tally_source_staging_rows FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND public.is_approved(auth.uid()));
CREATE POLICY tsr_admin_insert ON public.tally_source_staging_rows FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND public.is_approved(auth.uid())
    AND EXISTS (SELECT 1 FROM public.tally_source_staging_chunks c WHERE c.id = chunk_id AND c.source_id = tally_source_staging_rows.source_id));