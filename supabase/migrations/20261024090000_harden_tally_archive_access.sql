BEGIN;

-- Fail closed if this migration is replayed before its prerequisites.
DO $preflight$
BEGIN
  IF to_regclass('public.tally_archive_uploads') IS NULL THEN
    RAISE EXCEPTION 'Expected public.tally_archive_uploads; refusing partial archive hardening';
  END IF;
  IF to_regprocedure('public.is_approved(uuid)') IS NULL
     OR to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Expected approved-profile and role helpers; refusing unguarded archive access';
  END IF;
END
$preflight$;

-- RLS does not constrain TRUNCATE. Remove every browser/API table privilege
-- first, then grant only the row-level operations needed by the upload UI.
-- Archive status updates and processing remain server-side (service_role).
REVOKE ALL PRIVILEGES ON TABLE public.tally_archive_uploads
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.tally_archive_uploads TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.tally_archive_uploads TO service_role;

-- Only an approved Admin may access their own registry records. A hidden UI
-- is not an authorization boundary; these checks also apply to direct SQL/API
-- access under the authenticated database role.
DROP POLICY IF EXISTS "tally archive uploads owner read" ON public.tally_archive_uploads;
CREATE POLICY "tally archive uploads owner read"
  ON public.tally_archive_uploads FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_approved(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "tally archive uploads owner insert" ON public.tally_archive_uploads;
CREATE POLICY "tally archive uploads owner insert"
  ON public.tally_archive_uploads FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND processing_status = 'uploaded'
    AND public.is_approved(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "tally archive uploads owner delete" ON public.tally_archive_uploads;
CREATE POLICY "tally archive uploads owner delete"
  ON public.tally_archive_uploads FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_approved(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Keep private Storage access aligned with the same approved-Admin boundary
-- and owner-folder constraint. This does not change policies for other buckets.
DROP POLICY IF EXISTS "tally archive owners read own files" ON storage.objects;
CREATE POLICY "tally archive owners read own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'tally-archives'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_approved(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "tally archive owners upload own files" ON storage.objects;
CREATE POLICY "tally archive owners upload own files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tally-archives'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_approved(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "tally archive owners delete own files" ON storage.objects;
CREATE POLICY "tally archive owners delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tally-archives'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_approved(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

COMMIT;
