BEGIN;

-- Fail closed if this migration is replayed before its prerequisites.
DO $preflight$
BEGIN
  IF to_regclass('public.tally_archive_uploads') IS NULL THEN
    RAISE EXCEPTION 'Expected public.tally_archive_uploads; refusing partial archive hardening';
  END IF;
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.user_roles') IS NULL
     OR to_regtype('public.app_role') IS NULL THEN
    RAISE EXCEPTION 'Expected profile and role tables; refusing unguarded archive access';
  END IF;
END
$preflight$;

-- This helper binds role/approval to auth.uid(), not a caller-supplied identity
-- or mutable session setting. A fixed search_path and fully qualified objects
-- prevent object-shadowing in this SECURITY DEFINER authorization check.
CREATE OR REPLACE FUNCTION public.can_access_tally_archive(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT _user_id = auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.status = 'approved'
     )
     AND EXISTS (
       SELECT 1
       FROM public.user_roles r
       WHERE r.user_id = auth.uid()
         AND r.role = 'admin'::public.app_role
     )
$function$;

REVOKE ALL ON FUNCTION public.can_access_tally_archive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_tally_archive(uuid) TO authenticated;

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
    AND public.can_access_tally_archive(auth.uid())
  );

DROP POLICY IF EXISTS "tally archive uploads owner insert" ON public.tally_archive_uploads;
CREATE POLICY "tally archive uploads owner insert"
  ON public.tally_archive_uploads FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND processing_status = 'uploaded'
    AND public.can_access_tally_archive(auth.uid())
  );

DROP POLICY IF EXISTS "tally archive uploads owner delete" ON public.tally_archive_uploads;
CREATE POLICY "tally archive uploads owner delete"
  ON public.tally_archive_uploads FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.can_access_tally_archive(auth.uid())
  );

-- Keep private Storage access aligned with the same approved-Admin boundary
-- and owner-folder constraint. This does not change policies for other buckets.
DROP POLICY IF EXISTS "tally archive owners read own files" ON storage.objects;
CREATE POLICY "tally archive owners read own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'tally-archives'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.can_access_tally_archive(auth.uid())
  );

DROP POLICY IF EXISTS "tally archive owners upload own files" ON storage.objects;
CREATE POLICY "tally archive owners upload own files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tally-archives'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.can_access_tally_archive(auth.uid())
  );

DROP POLICY IF EXISTS "tally archive owners delete own files" ON storage.objects;
CREATE POLICY "tally archive owners delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tally-archives'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.can_access_tally_archive(auth.uid())
  );

COMMIT;
