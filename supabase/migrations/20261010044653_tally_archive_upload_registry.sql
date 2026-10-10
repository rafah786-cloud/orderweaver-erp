BEGIN;

CREATE TABLE IF NOT EXISTS public.tally_archive_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 255),
  object_path text NOT NULL UNIQUE,
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 524288000),
  sha256_hex text NOT NULL CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
  archive_format text NOT NULL CHECK (archive_format IN ('rar4','rar5')),
  processing_status text NOT NULL DEFAULT 'uploaded'
    CHECK (processing_status IN ('uploaded','queued','inspecting','needs_tally_restore','ready_for_validation','failed','deleted')),
  processing_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tally_archive_uploads_owner_created
  ON public.tally_archive_uploads(user_id, created_at DESC);

ALTER TABLE public.tally_archive_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tally_archive_uploads FROM anon;
GRANT SELECT, INSERT, DELETE ON public.tally_archive_uploads TO authenticated;
GRANT ALL ON public.tally_archive_uploads TO service_role;

DROP POLICY IF EXISTS "tally archive uploads owner read" ON public.tally_archive_uploads;
CREATE POLICY "tally archive uploads owner read"
  ON public.tally_archive_uploads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tally archive uploads owner insert" ON public.tally_archive_uploads;
CREATE POLICY "tally archive uploads owner insert"
  ON public.tally_archive_uploads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND processing_status = 'uploaded');

DROP POLICY IF EXISTS "tally archive uploads owner delete" ON public.tally_archive_uploads;
CREATE POLICY "tally archive uploads owner delete"
  ON public.tally_archive_uploads FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMIT;
