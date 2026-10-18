"""Adversarial RLS tests for sensitive enterprise finance tables.

Runs only against a disposable local PostgreSQL cluster. No production
credentials or database URLs are passed into the child process.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

USER_ID = "00000000-0000-0000-0000-000000000001"
COMPANY_A = "10000000-0000-0000-0000-000000000001"
COMPANY_B = "10000000-0000-0000-0000-000000000002"
ROW_A = "20000000-0000-0000-0000-000000000001"
ROW_B = "20000000-0000-0000-0000-000000000002"
ROW_NEW = "30000000-0000-0000-0000-000000000001"
TABLES = ("budgets", "bank_reconciliations", "fixed_assets")


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

    with tempfile.TemporaryDirectory(prefix="enterprise-finance-rls-") as temp:
        base = Path(temp)
        socket = base / "socket"
        socket.mkdir()
        env.update(PGHOST=str(socket), PGPORT="55448", PGDATABASE="postgres", PGUSER="postgres")

        def run(args, check=True):
            return subprocess.run(args, env=env, text=True, capture_output=True, check=check)

        def local(args):
            if os.geteuid() == 0:
                return ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups", *args]
            return args

        if os.geteuid() == 0:
            subprocess.run(["chown", "-R", "lovable", temp], check=True)
        run(local(["initdb", "-D", str(base / "data"), "-A", "trust", "-U", "postgres", "--no-instructions"]))
        run(local([
            "pg_ctl", "-D", str(base / "data"),
            "-o", f"-k {socket} -p 55448 -h ''",
            "-l", str(base / "server.log"), "start",
        ]))

        checks = 0
        try:
            def sql(query, *, role="sales", company=COMPANY_A, approved=True, caller=True, check=True):
                prefix = ""
                if caller:
                    approval = "true" if approved else "false"
                    prefix = (
                        f"SET ROLE authenticated; "
                        f"SET request.jwt.claim.sub='{USER_ID}'; "
                        f"SET test.role='{role}'; "
                        f"SET test.company='{company}'; "
                        f"SET test.approved='{approval}';"
                    )
                return run([
                    "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", prefix + query
                ], check=check)

            def expect(name, condition):
                nonlocal checks
                if not condition:
                    raise AssertionError(name)
                checks += 1

            sql("""
                CREATE ROLE authenticated;
                CREATE ROLE anon;
                CREATE SCHEMA auth;
                CREATE TYPE public.app_role AS ENUM
                  ('admin','accountant','sales','production','hr','employee','customer','vendor');
                CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
                  $$ SELECT current_setting('request.jwt.claim.sub', true)::uuid $$;
                CREATE FUNCTION public.is_approved(uuid) RETURNS boolean LANGUAGE sql AS
                  $$ SELECT coalesce(current_setting('test.approved', true), 'true')::boolean $$;
                CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql AS
                  $$ SELECT coalesce(nullif(current_setting('test.company', true), ''), '10000000-0000-0000-0000-000000000001')::uuid $$;
                CREATE FUNCTION public.has_company_access(uuid) RETURNS boolean LANGUAGE sql AS
                  $$ SELECT $1 = public.current_company_id() $$;
                CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql AS
                  $$ SELECT _user_id = auth.uid() AND coalesce(current_setting('test.role', true), 'sales') = _role::text $$;
                GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
            """, caller=False)

            for table in TABLES:
                sql(f"CREATE TABLE public.{table}(id uuid PRIMARY KEY, company_id uuid NOT NULL, amount numeric NOT NULL DEFAULT 0)", caller=False)
                sql(f"GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO authenticated, anon", caller=False)
                sql(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY", caller=False)
                sql(f"""
                    CREATE POLICY company_permission_select ON public.{table}
                      FOR SELECT TO authenticated
                      USING (public.is_approved(auth.uid()) AND company_id = public.current_company_id() AND public.has_company_access(company_id));
                    CREATE POLICY company_permission_insert ON public.{table}
                      FOR INSERT TO authenticated
                      WITH CHECK (public.is_approved(auth.uid()) AND company_id = public.current_company_id() AND public.has_company_access(company_id));
                    CREATE POLICY company_permission_update ON public.{table}
                      FOR UPDATE TO authenticated
                      USING (public.is_approved(auth.uid()) AND company_id = public.current_company_id() AND public.has_company_access(company_id))
                      WITH CHECK (public.is_approved(auth.uid()) AND company_id = public.current_company_id() AND public.has_company_access(company_id));
                    CREATE POLICY company_permission_delete ON public.{table}
                      FOR DELETE TO authenticated
                      USING (public.is_approved(auth.uid()) AND company_id = public.current_company_id() AND public.has_company_access(company_id));
                """, caller=False)
                sql(f"""
                    INSERT INTO public.{table}(id, company_id, amount)
                    VALUES ('{ROW_A}', '{COMPANY_A}', 100), ('{ROW_B}', '{COMPANY_B}', 900);
                """, caller=False)

            sql(migration.read_text(encoding="utf-8"), caller=False)

            for table in TABLES:
                expect(f"{table}: Admin can read finance rows",
                       sql(f"SELECT count(*) FROM public.{table}", role="admin").stdout.strip() == "1")
                expect(f"{table}: Accountant can read finance rows",
                       sql(f"SELECT count(*) FROM public.{table}", role="accountant").stdout.strip() == "1")
                for role in ("sales", "production", "hr", "employee", "customer", "vendor"):
                    expect(f"{table}: {role} cannot read finance rows",
                           sql(f"SELECT count(*) FROM public.{table}", role=role).stdout.strip() == "0")
                    denied_insert = sql(
                        f"INSERT INTO public.{table}(id, company_id, amount) VALUES ('{ROW_NEW}', '{COMPANY_A}', 1)",
                        role=role, check=False,
                    )
                    expect(f"{table}: {role} cannot insert finance rows", denied_insert.returncode != 0)
                    expect(f"{table}: {role} cannot update finance rows",
                           sql(f"UPDATE public.{table} SET amount=0 WHERE id='{ROW_A}' RETURNING id", role=role).stdout.strip() == "")
                    expect(f"{table}: {role} cannot delete finance rows",
                           sql(f"DELETE FROM public.{table} WHERE id='{ROW_A}' RETURNING id", role=role).stdout.strip() == "")

                expect(f"{table}: company A cannot read company B rows",
                       sql(f"SELECT count(*) FROM public.{table} WHERE id='{ROW_B}'", role="accountant", company=COMPANY_A).stdout.strip() == "0")
                expect(f"{table}: company B context sees only its own row",
                       sql(f"SELECT count(*) FROM public.{table}", role="accountant", company=COMPANY_B).stdout.strip() == "1")
                expect(f"{table}: pending accountant cannot read finance rows",
                       sql(f"SELECT count(*) FROM public.{table}", role="accountant", approved=False).stdout.strip() == "0")
                denied_company_insert = sql(
                    f"INSERT INTO public.{table}(id, company_id, amount) VALUES ('{ROW_NEW}', '{COMPANY_B}', 1)",
                    role="accountant", check=False,
                )
                expect(f"{table}: accountant cannot insert into another company",
                       denied_company_insert.returncode != 0)

            print(f"PASS: {checks} adversarial finance RLS checks across {len(TABLES)} tables")
        finally:
            run(local(["pg_ctl", "-D", str(base / "data"), "stop", "-m", "immediate"]), check=False)


if __name__ == "__main__":
    main()
