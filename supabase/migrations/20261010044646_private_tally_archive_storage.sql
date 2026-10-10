BEGIN;

-- Private storage for administrator-uploaded Tally backups. Files are kept
-- intact; parsing/extraction is a separate, explicitly controlled operation.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tally-archives', 'tally-archives', false, 524288000)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 524288000;

DROP POLICY IF EXISTS "tally archive owners read own files" ON storage.objects;
CREATE POLICY "tally archive owners read own files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tally-archives'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "tally archive owners upload own files" ON storage.objects;
CREATE POLICY "tally archive owners upload own files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tally-archives'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "tally archive owners delete own files" ON storage.objects;
CREATE POLICY "tally archive owners delete own files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tally-archives'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

COMMIT;
