"""Adversarial RLS tests for sensitive enterprise finance tables.

Runs only against a disposable local PostgreSQL cluster. No production
credentials or database URLs are passed into the child process.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

USER_ADMIN = "00000000-0000-0000-0000-000000000001"
USER_ACCOUNTANT = "00000000-0000-0000-0000-000000000002"
USER_SALES = "00000000-0000-0000-0000-000000000003"
USER_PRODUCTION = "00000000-0000-0000-0000-000000000004"
USER_HR = "00000000-0000-0000-0000-000000000005"
USER_EMPLOYEE = "00000000-0000-0000-0000-000000000006"
USER_CUSTOMER = "00000000-0000-0000-0000-000000000007"
USER_VENDOR = "00000000-0000-0000-0000-000000000008"
USER_PENDING_ACCOUNTANT = "00000000-0000-0000-0000-000000000009"
USER_COMPANY_B_ACCOUNTANT = "00000000-0000-0000-0000-000000000010"
COMPANY_A = "10000000-0000-0000-0000-000000000001"
COMPANY_B = "10000000-0000-0000-0000-000000000002"
ROW_A = "20000000-0000-0000-0000-000000000001"
ROW_B = "20000000-0000-0000-0000-000000000002"
ROW_NEW = "30000000-0000-0000-0000-000000000001"
TABLES = ("budgets", "bank_reconciliations", "fixed_assets")

USER_CONTEXTS = {
    ("admin", COMPANY_A, True): USER_ADMIN,
    ("accountant", COMPANY_A, True): USER_ACCOUNTANT,
    ("sales", COMPANY_A, True): USER_SALES,
    ("production", COMPANY_A, True): USER_PRODUCTION,
    ("hr", COMPANY_A, True): USER_HR,
    ("employee", COMPANY_A, True): USER_EMPLOYEE,
    ("customer", COMPANY_A, True): USER_CUSTOMER,
    ("vendor", COMPANY_A, True): USER_VENDOR,
    ("accountant", COMPANY_A, False): USER_PENDING_ACCOUNTANT,
    ("accountant", COMPANY_B, True): USER_COMPANY_B_ACCOUNTANT,
}


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
            "-o", f"-k {socket} -p 55448 -h ''",
            "-l", str(base / "server.log"), "start",
        ]))

        checks = 0
        try:
            def sql(query, *, role="sales", company=COMPANY_A, approved=True, caller=True, check=True, db_role="authenticated"):
                prefix = ""
                if caller:
                    prefix = f"SET ROLE {db_role}; "
                    if db_role == "authenticated":
                        try:
                            user_id = USER_CONTEXTS[(role, company, approved)]
                        except KeyError as exc:
                            raise ValueError(f"No seeded identity for role/company/approval: {(role, company, approved)}") from exc
                        prefix += f"SET request.jwt.claim.sub='{user_id}'; "
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
                -- Authorization facts come from seeded database rows, not caller-controlled
                -- test.role/test.approved/test.company custom GUCs. The only identity
                -- input is the JWT-sub claim set by this isolated test harness.
                CREATE TABLE public.test_profiles (
                  user_id uuid PRIMARY KEY, approved boolean NOT NULL,
                  current_company_id uuid NOT NULL
                );
                CREATE TABLE public.test_user_roles (
                  user_id uuid NOT NULL, role public.app_role NOT NULL,
                  PRIMARY KEY (user_id, role)
                );
                CREATE TABLE public.test_company_memberships (
                  user_id uuid NOT NULL, company_id uuid NOT NULL, can_view boolean NOT NULL DEFAULT true,
                  PRIMARY KEY (user_id, company_id)
                );
                CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
                  $ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $;
                CREATE FUNCTION public.is_approved(_user_id uuid) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
                  $ SELECT coalesce((SELECT p.approved FROM public.test_profiles p WHERE p.user_id = _user_id), false) $;
                CREATE FUNCTION public.current_company_id() RETURNS uuid
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
                  $ SELECT p.current_company_id FROM public.test_profiles p WHERE p.user_id = auth.uid() $;
                CREATE FUNCTION public.has_company_access(_company_id uuid) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
                  $ SELECT EXISTS (
                       SELECT 1 FROM public.test_company_memberships m
                       WHERE m.user_id = auth.uid() AND m.company_id = _company_id AND m.can_view
                     ) $;
                CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
                  $ SELECT _user_id = auth.uid() AND EXISTS (
                       SELECT 1 FROM public.test_user_roles r
                       WHERE r.user_id = _user_id AND r.role = _role
                     ) $;
                REVOKE ALL ON public.test_profiles, public.test_user_roles, public.test_company_memberships FROM PUBLIC, anon, authenticated;
                GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
                GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
                GRANT EXECUTE ON FUNCTION public.is_approved(uuid), public.current_company_id(),
                  public.has_company_access(uuid), public.has_role(uuid, public.app_role)
                  TO authenticated;
                INSERT INTO public.test_profiles(user_id, approved, current_company_id) VALUES
                  ('00000000-0000-0000-0000-000000000001', true, '10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000002', true, '10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000003', true, '10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000004', true, '10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000005', true, '10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000006', true, '10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000007', true, '10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000008', true, '10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000009', false, '10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000010', true, '10000000-0000-0000-0000-000000000002');
                INSERT INTO public.test_user_roles(user_id, role) VALUES
                  ('00000000-0000-0000-0000-000000000001', 'admin'),
                  ('00000000-0000-0000-0000-000000000002', 'accountant'),
                  ('00000000-0000-0000-0000-000000000003', 'sales'),
                  ('00000000-0000-0000-0000-000000000004', 'production'),
                  ('00000000-0000-0000-0000-000000000005', 'hr'),
                  ('00000000-0000-0000-0000-000000000006', 'employee'),
                  ('00000000-0000-0000-0000-000000000007', 'customer'),
                  ('00000000-0000-0000-0000-000000000008', 'vendor'),
                  ('00000000-0000-0000-0000-000000000009', 'accountant'),
                  ('00000000-0000-0000-0000-000000000010', 'accountant');
                INSERT INTO public.test_company_memberships(user_id, company_id, can_view) VALUES
                  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', true),
                  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', true),
                  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', true),
                  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', true),
                  ('00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', true),
                  ('00000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', true),
                  ('00000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', true),
                  ('00000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', true),
                  ('00000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', true),
                  ('00000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002', true);
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

            helper = sql(
                "SELECT prosecdef::text || '|' || array_to_string(proconfig, ',') "
                "FROM pg_proc WHERE oid = 'public.can_access_enterprise_finance(uuid)'::regprocedure",
                caller=False,
            ).stdout.strip()
            expect("finance authorization helper is SECURITY DEFINER with fixed search_path",
                   helper == "true|search_path=public")
            expect("finance authorization helper is not executable by anon",
                   sql("SELECT has_function_privilege('anon', 'public.can_access_enterprise_finance(uuid)', 'EXECUTE')",
                       caller=False).stdout.strip() == "f")
            expect("finance authorization helper is executable by authenticated",
                   sql("SELECT has_function_privilege('authenticated', 'public.can_access_enterprise_finance(uuid)', 'EXECUTE')",
                       caller=False).stdout.strip() == "t")

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

                # Authorized CRUD must remain available inside the authorized company.
                for authorized_role in ("admin", "accountant"):
                    insert = sql(
                        f"INSERT INTO public.{table}(id, company_id, amount) VALUES ('{ROW_NEW}', '{COMPANY_A}', 1)",
                        role=authorized_role,
                    )
                    expect(f"{table}: {authorized_role} can create within company",
                           insert.returncode == 0)
                    expect(f"{table}: {authorized_role} can read their created row",
                           sql(f"SELECT count(*) FROM public.{table} WHERE id='{ROW_NEW}",
                               role=authorized_role).stdout.strip() == "1")
                    update = sql(
                        f"UPDATE public.{table} SET amount=101 WHERE id='{ROW_NEW}' RETURNING id",
                        role=authorized_role,
                    )
                    expect(f"{table}: {authorized_role} can edit within company",
                           update.stdout.strip() == ROW_NEW)
                    expect(f"{table}: {authorized_role} edit persisted",
                           sql(f"SELECT amount::text FROM public.{table} WHERE id='{ROW_NEW}'",
                               role=authorized_role).stdout.strip() == "101")
                    delete = sql(
                        f"DELETE FROM public.{table} WHERE id='{ROW_NEW}' RETURNING id",
                        role=authorized_role,
                    )
                    expect(f"{table}: {authorized_role} can delete within company",
                           delete.stdout.strip() == ROW_NEW)
                    expect(f"{table}: {authorized_role} delete persisted",
                           sql(f"SELECT count(*) FROM public.{table} WHERE id='{ROW_NEW}'",
                               role=authorized_role).stdout.strip() == "0")

                mass_assignment = sql(
                    f"UPDATE public.{table} SET company_id='{COMPANY_B}' WHERE id='{ROW_A}' RETURNING id",
                    role="accountant", check=False,
                )
                expect(f"{table}: company_id mass assignment rejected",
                       mass_assignment.returncode != 0)
                expect(f"{table}: failed mass assignment leaves source row unchanged",
                       sql(f"SELECT company_id::text FROM public.{table} WHERE id='{ROW_A}'",
                           caller=False).stdout.strip() == COMPANY_A)

                # These custom GUCs are not authorization sources and must not
                # change the database-backed role, approval, or company identity.
                spoofed_role = sql(
                    f"SET test.role='admin'; SET test.approved='true'; SET test.company='{COMPANY_B}'; "
                    f"SELECT count(*) FROM public.{table}",
                    role="sales",
                )
                expect(f"{table}: forged role/approval/company GUCs do not elevate Sales",
                       spoofed_role.stdout.strip() == "0")
                spoofed_approval = sql(
                    f"SET test.approved='true'; SELECT count(*) FROM public.{table}",
                    role="accountant", approved=False,
                )
                expect(f"{table}: forged approval GUC does not approve pending accountant",
                       spoofed_approval.stdout.strip() == "0")
                spoofed_company = sql(
                    f"SET test.company='{COMPANY_B}'; SELECT count(*) FROM public.{table} WHERE id='{ROW_B}'",
                    role="accountant", company=COMPANY_A,
                )
                expect(f"{table}: forged company GUC does not switch company scope",
                       spoofed_company.stdout.strip() == "0")

                pending_insert = sql(
                    f"INSERT INTO public.{table}(id, company_id, amount) VALUES ('{ROW_NEW}', '{COMPANY_A}', 1)",
                    role="accountant", approved=False, check=False,
                )
                expect(f"{table}: pending accountant cannot insert finance rows",
                       pending_insert.returncode != 0)
                expect(f"{table}: pending accountant cannot update finance rows",
                       sql(f"UPDATE public.{table} SET amount=0 WHERE id='{ROW_A}' RETURNING id",
                           role="accountant", approved=False).stdout.strip() == "")
                expect(f"{table}: pending accountant cannot delete finance rows",
                       sql(f"DELETE FROM public.{table} WHERE id='{ROW_A}' RETURNING id",
                           role="accountant", approved=False).stdout.strip() == "")

                anon_read = sql(f"SELECT count(*) FROM public.{table}", db_role="anon")
                expect(f"{table}: anon direct read is denied by RLS",
                       anon_read.stdout.strip() == "0")

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
            print("Coverage: DB-backed authorization facts, positive CRUD, mass assignment, forged context GUCs, and anon direct reads")
        finally:
            run(local(["pg_ctl", "-D", str(base / "data"), "stop", "-m", "immediate"]), check=False)


if __name__ == "__main__":
    main()
