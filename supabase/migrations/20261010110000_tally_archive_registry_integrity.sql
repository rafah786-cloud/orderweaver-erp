BEGIN;

-- Keep the registry's ownership metadata aligned with the private Storage path.
-- A signed-in user must not be able to register a path under another user's folder.
ALTER TABLE public.tally_archive_uploads
  ADD CONSTRAINT tally_archive_uploads_owner_path_check
  CHECK (split_part(object_path, '/', 1) = user_id::text AND position('/' in object_path) > 1);

CREATE OR REPLACE FUNCTION public.set_tally_archive_uploads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tally_archive_uploads_updated_at ON public.tally_archive_uploads;
CREATE TRIGGER tally_archive_uploads_updated_at
BEFORE UPDATE ON public.tally_archive_uploads
FOR EACH ROW
EXECUTE FUNCTION public.set_tally_archive_uploads_updated_at();

COMMIT;
