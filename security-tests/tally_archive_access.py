"""Adversarial tests for the Tally archive registry and Storage policies.

Runs against a disposable local PostgreSQL cluster only. The fixture uses
database-backed synthetic identities/roles/approval state; it does not accept
caller-settable role or approval flags as authorization facts.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ADMIN_A = "00000000-0000-0000-0000-000000000001"
SALES_B = "00000000-0000-0000-0000-000000000002"
PENDING_ADMIN_C = "00000000-0000-0000-0000-000000000003"
ROW_A = "20000000-0000-0000-0000-000000000001"
ROW_B = "20000000-0000-0000-0000-000000000002"
ROW_NEW = "30000000-0000-0000-0000-000000000001"
ROW_FORGED = "30000000-0000-0000-0000-000000000002"
SHA = "0" * 64


def main() -> None:
    migration = Path(sys.argv[1]).resolve()
    if not migration.is_file():
        raise FileNotFoundError(migration)

    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("PG", "SUPABASE_", "VITE_SUPABASE_"))
        and "DATABASE_URL" not in key
    }

    with tempfile.TemporaryDirectory(prefix="tally-archive-security-") as temp:
        base = Path(temp)
        socket = base / "socket"
        socket.mkdir()
        env.update(PGHOST=str(socket), PGPORT="55451", PGDATABASE="postgres", PGUSER="postgres")

        def run(args, check=True):
            result = subprocess.run(args, env=env, text=True, capture_output=True, check=False)
            if check and result.returncode != 0:
                raise RuntimeError(
                    f"Command failed ({result.returncode}): {args[0]}\n"
                    f"stdout: {result.stdout[-3000:]}\nstderr: {result.stderr[-5000:]}"
                )
            return result

        def local(args):
            if os.geteuid() == 0:
                return ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups", *args]
            return args

        if os.geteuid() == 0:
            subprocess.run(["chown", "-R", "lovable", temp], check=True)
        run(local(["initdb", "-D", str(base / "data"), "-A", "trust", "-U", "postgres", "--no-instructions"]))
        run(local([
            "pg_ctl", "-D", str(base / "data"),
            "-o", f"-k {socket} -p 55451 -h ''",
            "-l", str(base / "server.log"), "start",
        ]))

        checks = 0
        try:
            def sql(query, *, user_id=None, check=True):
                if user_id:
                    query = (
                        "SET ROLE authenticated; "
                        f"SELECT set_config('request.jwt.claim.sub', '{user_id}', false); "
                        + query
                    )
                return run([
                    "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", query
                ], check=check)

            def scalar(query, *, user_id=None):
                lines = sql(query, user_id=user_id).stdout.strip().splitlines()
                return lines[-1] if lines else ""

            def expect(name, condition):
                nonlocal checks
                if not condition:
                    raise AssertionError(name)
                checks += 1

            sql("""
                CREATE ROLE anon NOLOGIN;
                CREATE ROLE authenticated NOLOGIN;
                CREATE ROLE service_role NOLOGIN BYPASSRLS;
                CREATE SCHEMA auth;
                CREATE SCHEMA storage;
                CREATE TYPE public.app_role AS ENUM
                  ('admin','accountant','sales','production','hr','employee','customer','vendor');
                GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;

                CREATE FUNCTION auth.uid() RETURNS uuid
                  LANGUAGE sql STABLE
                  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

                CREATE TABLE public.profiles (
                  id uuid PRIMARY KEY,
                  status text NOT NULL CHECK (status IN ('approved','pending','rejected'))
                );
                CREATE TABLE public.user_roles (
                  user_id uuid NOT NULL,
                  role public.app_role NOT NULL,
                  PRIMARY KEY (user_id, role)
                );

                CREATE FUNCTION public.is_approved(_user_id uuid) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
                  AS $function$
                    SELECT _user_id = auth.uid()
                      AND EXISTS (SELECT 1 FROM public.profiles p
                                  WHERE p.id = _user_id AND p.status = 'approved')
                  $function$;

                CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
                  AS $function$
                    SELECT _user_id = auth.uid()
                      AND public.is_approved(auth.uid())
                      AND EXISTS (SELECT 1 FROM public.user_roles r
                                  WHERE r.user_id = auth.uid() AND r.role = _role)
                  $function$;

                CREATE TABLE public.tally_archive_uploads (
                  id uuid PRIMARY KEY,
                  user_id uuid NOT NULL,
                  original_filename text NOT NULL,
                  object_path text NOT NULL UNIQUE,
                  byte_size bigint NOT NULL,
                  sha256_hex text NOT NULL,
                  archive_format text NOT NULL,
                  processing_status text NOT NULL DEFAULT 'uploaded',
                  created_at timestamptz NOT NULL DEFAULT now(),
                  updated_at timestamptz NOT NULL DEFAULT now()
                );
                ALTER TABLE public.tally_archive_uploads ENABLE ROW LEVEL SECURITY;
                -- Simulate broad default privileges that the hardening migration must remove.
                GRANT ALL PRIVILEGES ON TABLE public.tally_archive_uploads TO PUBLIC, anon, authenticated, service_role;

                CREATE POLICY "tally archive uploads owner read"
                  ON public.tally_archive_uploads FOR SELECT TO authenticated
                  USING (user_id = auth.uid());
                CREATE POLICY "tally archive uploads owner insert"
                  ON public.tally_archive_uploads FOR INSERT TO authenticated
                  WITH CHECK (user_id = auth.uid() AND processing_status = 'uploaded');
                CREATE POLICY "tally archive uploads owner delete"
                  ON public.tally_archive_uploads FOR DELETE TO authenticated
                  USING (user_id = auth.uid());

                CREATE TABLE storage.objects (
                  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                  bucket_id text NOT NULL,
                  name text NOT NULL
                );
                ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
                GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, anon;
                CREATE FUNCTION storage.foldername(_name text) RETURNS text[]
                  LANGUAGE sql IMMUTABLE
                  AS $$ SELECT string_to_array(regexp_replace(_name, '/[^/]*$', ''), '/') $$;

                CREATE POLICY "tally archive owners read own files"
                  ON storage.objects FOR SELECT TO authenticated
                  USING (bucket_id = 'tally-archives' AND (storage.foldername(name))[1] = auth.uid()::text);
                CREATE POLICY "tally archive owners upload own files"
                  ON storage.objects FOR INSERT TO authenticated
                  WITH CHECK (bucket_id = 'tally-archives' AND (storage.foldername(name))[1] = auth.uid()::text);
                CREATE POLICY "tally archive owners delete own files"
                  ON storage.objects FOR DELETE TO authenticated
                  USING (bucket_id = 'tally-archives' AND (storage.foldername(name))[1] = auth.uid()::text);

                INSERT INTO public.profiles(id, status) VALUES
                  ('${ADMIN_A}', 'approved'),
                  ('${SALES_B}', 'approved'),
                  ('${PENDING_ADMIN_C}', 'pending');
                INSERT INTO public.user_roles(user_id, role) VALUES
                  ('${ADMIN_A}', 'admin'),
                  ('${SALES_B}', 'sales'),
                  ('${PENDING_ADMIN_C}', 'admin');

                INSERT INTO public.tally_archive_uploads
                  (id, user_id, original_filename, object_path, byte_size, sha256_hex, archive_format)
                VALUES
                  ('${ROW_A}', '${ADMIN_A}', 'a.rar', '${ADMIN_A}/a.rar', 100, '${SHA}', 'rar5'),
                  ('${ROW_B}', '${SALES_B}', 'b.rar', '${SALES_B}/b.rar', 100, '${SHA}', 'rar5');
                INSERT INTO storage.objects(bucket_id, name) VALUES
                  ('tally-archives', '${ADMIN_A}/a.rar'),
                  ('tally-archives', '${SALES_B}/b.rar');
            """)
            sql(migration.read_text())

            privileges = scalar("""
              SELECT
                has_table_privilege('authenticated','public.tally_archive_uploads','SELECT') AND
                has_table_privilege('authenticated','public.tally_archive_uploads','INSERT') AND
                has_table_privilege('authenticated','public.tally_archive_uploads','DELETE') AND
                NOT has_table_privilege('authenticated','public.tally_archive_uploads','UPDATE') AND
                NOT has_table_privilege('authenticated','public.tally_archive_uploads','TRUNCATE') AND
                NOT has_table_privilege('authenticated','public.tally_archive_uploads','REFERENCES') AND
                NOT has_table_privilege('authenticated','public.tally_archive_uploads','TRIGGER') AND
                NOT has_table_privilege('anon','public.tally_archive_uploads','SELECT')
            """)
            expect("registry ACLs are least-privilege", privileges == "t")
            helper_exec = scalar("""
              SELECT has_function_privilege('authenticated','public.can_access_tally_archive(uuid)','EXECUTE')
                 AND NOT has_function_privilege('anon','public.can_access_tally_archive(uuid)','EXECUTE')
            """)
            expect("archive authorization helper execute privilege is restricted", helper_exec == "t")
            expect("Admin cannot ask the helper to authorize another identity",
                   scalar(f"SELECT public.can_access_tally_archive('{SALES_B}')", user_id=ADMIN_A) == "f")

            expect("approved Admin sees own archive only",
                   scalar("SELECT count(*) FROM public.tally_archive_uploads", user_id=ADMIN_A) == "1")
            expect("approved Sales cannot read archive registry",
                   scalar("SELECT count(*) FROM public.tally_archive_uploads", user_id=SALES_B) == "0")
            expect("pending Admin cannot read archive registry",
                   scalar("SELECT count(*) FROM public.tally_archive_uploads", user_id=PENDING_ADMIN_C) == "0")

            sql(f"""
              INSERT INTO public.tally_archive_uploads
                (id, user_id, original_filename, object_path, byte_size, sha256_hex, archive_format)
              VALUES ('{ROW_NEW}', '{ADMIN_A}', 'new.rar', '{ADMIN_A}/new.rar', 100, '{SHA}', 'rar5')
            """, user_id=ADMIN_A)
            expect("approved Admin can register own upload",
                   scalar(f"SELECT count(*) FROM public.tally_archive_uploads WHERE id='{ROW_NEW}'") == "1")

            sql(f"DELETE FROM public.tally_archive_uploads WHERE id='{ROW_B}'", user_id=SALES_B)
            expect("Sales cannot delete their own archive row",
                   scalar(f"SELECT count(*) FROM public.tally_archive_uploads WHERE id='{ROW_B}'") == "1")
            sql(f"DELETE FROM public.tally_archive_uploads WHERE id='{ROW_NEW}'", user_id=ADMIN_A)
            expect("approved Admin can delete own archive row",
                   scalar(f"SELECT count(*) FROM public.tally_archive_uploads WHERE id='{ROW_NEW}'") == "0")

            denied_anon = run([
                "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c",
                "SET ROLE anon; SELECT count(*) FROM public.tally_archive_uploads",
            ], check=False)
            expect("anonymous direct registry read is denied", denied_anon.returncode != 0)

            denied_sales = sql(f"""
              INSERT INTO public.tally_archive_uploads
                (id, user_id, original_filename, object_path, byte_size, sha256_hex, archive_format)
              VALUES ('{ROW_FORGED}', '{SALES_B}', 'forged.rar', '{SALES_B}/forged.rar', 100, '{SHA}', 'rar5')
            """, user_id=SALES_B, check=False)
            expect("Sales direct INSERT is denied", denied_sales.returncode != 0)

            denied_pending = sql(f"""
              INSERT INTO public.tally_archive_uploads
                (id, user_id, original_filename, object_path, byte_size, sha256_hex, archive_format)
              VALUES ('{ROW_FORGED}', '{PENDING_ADMIN_C}', 'pending.rar', '{PENDING_ADMIN_C}/pending.rar', 100, '{SHA}', 'rar5')
            """, user_id=PENDING_ADMIN_C, check=False)
            expect("pending Admin direct INSERT is denied", denied_pending.returncode != 0)

            forged = sql(f"""
              INSERT INTO public.tally_archive_uploads
                (id, user_id, original_filename, object_path, byte_size, sha256_hex, archive_format)
              VALUES ('{ROW_FORGED}', '{SALES_B}', 'forged.rar', '{ADMIN_A}/forged.rar', 100, '{SHA}', 'rar5')
            """, user_id=ADMIN_A, check=False)
            expect("Admin cannot mass-assign another owner's user_id", forged.returncode != 0)

            denied_update = sql(
                f"UPDATE public.tally_archive_uploads SET processing_status='queued' WHERE id='{ROW_A}'",
                user_id=ADMIN_A, check=False)
            expect("browser role cannot update processing status", denied_update.returncode != 0)

            denied_truncate = sql("TRUNCATE public.tally_archive_uploads", user_id=ADMIN_A, check=False)
            expect("browser role cannot TRUNCATE despite RLS", denied_truncate.returncode != 0)

            expect("approved Admin sees own Storage object only",
                   scalar("SELECT count(*) FROM storage.objects WHERE bucket_id='tally-archives'",
                          user_id=ADMIN_A) == "1")
            expect("Sales cannot read Storage archive objects",
                   scalar("SELECT count(*) FROM storage.objects WHERE bucket_id='tally-archives'",
                          user_id=SALES_B) == "0")
            expect("pending Admin cannot read Storage archive objects",
                   scalar("SELECT count(*) FROM storage.objects WHERE bucket_id='tally-archives'",
                          user_id=PENDING_ADMIN_C) == "0")

            sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES ('tally-archives','{ADMIN_A}/new.rar')",
                user_id=ADMIN_A)
            sql(f"DELETE FROM storage.objects WHERE bucket_id='tally-archives' AND name='{SALES_B}/b.rar'",
                user_id=SALES_B)
            expect("Sales cannot delete their own Storage object",
                   scalar(f"SELECT count(*) FROM storage.objects WHERE bucket_id='tally-archives' AND name='{SALES_B}/b.rar'") == "1")
            sql(f"DELETE FROM storage.objects WHERE bucket_id='tally-archives' AND name='{ADMIN_A}/new.rar'",
                user_id=ADMIN_A)
            expect("approved Admin can delete own Storage object",
                   scalar(f"SELECT count(*) FROM storage.objects WHERE bucket_id='tally-archives' AND name='{ADMIN_A}/new.rar'") == "0")
            denied_storage_sales = sql(
                f"INSERT INTO storage.objects(bucket_id,name) VALUES ('tally-archives','{SALES_B}/bad.rar')",
                user_id=SALES_B, check=False)
            expect("Sales direct Storage INSERT is denied", denied_storage_sales.returncode != 0)
            denied_storage_pending = sql(
                f"INSERT INTO storage.objects(bucket_id,name) VALUES ('tally-archives','{PENDING_ADMIN_C}/bad.rar')",
                user_id=PENDING_ADMIN_C, check=False)
            expect("pending Admin direct Storage INSERT is denied", denied_storage_pending.returncode != 0)
            denied_storage_forged = sql(
                f"INSERT INTO storage.objects(bucket_id,name) VALUES ('tally-archives','{SALES_B}/forged.rar')",
                user_id=ADMIN_A, check=False)
            expect("Admin cannot upload into another owner's Storage folder",
                   denied_storage_forged.returncode != 0)

            print(f"PASS: {checks} Tally archive authorization and grant checks")
        finally:
            run(local(["pg_ctl", "-D", str(base / "data"), "stop", "-m", "fast"]), check=False)


if __name__ == "__main__":
    main()
