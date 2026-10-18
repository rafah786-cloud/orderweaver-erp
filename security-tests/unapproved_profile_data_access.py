"""Adversarial test for approval gates and disabled unused HR/AI browser access.

Uses a disposable local PostgreSQL cluster and synthetic identities only. The
child process is stripped of Supabase/DATABASE_URL/PG environment variables.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

USER_PENDING = "00000000-0000-0000-0000-000000000001"
USER_APPROVED = "00000000-0000-0000-0000-000000000002"
USER_APPROVED_NONADMIN = "00000000-0000-0000-0000-000000000004"
USER_MISSING_PROFILE = "00000000-0000-0000-0000-000000000003"
COMPANY_A = "10000000-0000-0000-0000-000000000001"
COMPANY_B = "10000000-0000-0000-0000-000000000002"
ROW_A = "20000000-0000-0000-0000-000000000001"
ROW_B = "20000000-0000-0000-0000-000000000002"
LOCKED = [
    "ai_action_proposals", "ai_alerts", "ai_answer_evaluations",
    "ai_context_bindings", "ai_forecast_models", "ai_skills",
    "employee_leave_requests", "employee_lifecycle_events",
    "employee_performance_cycles", "employee_training_records",
]


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

    with tempfile.TemporaryDirectory(prefix="approved-data-access-") as temp:
        base = Path(temp)
        socket = base / "socket"
        socket.mkdir()
        env.update(PGHOST=str(socket), PGPORT="55451", PGDATABASE="postgres", PGUSER="postgres")

        def run(args, check=True):
            result = subprocess.run(args, env=env, text=True, capture_output=True, check=False)
            if check and result.returncode != 0:
                raise RuntimeError(
                    "Command failed: " + " ".join(args) + "\\n"
                    + "stdout:\\n" + result.stdout + "\\nstderr:\\n" + result.stderr
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
            def sql(query, *, user=USER_PENDING, company=COMPANY_A, approved=False,
                    db_role="authenticated", caller=True, check=True):
                prefix = ""
                if caller:
                    profile_status = "approved" if approved else "pending"
                    prefix = (
                        f"SET ROLE {db_role}; "
                        f"SET request.jwt.claim.sub='{user}'; "
                        f"SET test.company='{company}';"
                    )
                return run([
                    "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", prefix + query
                ], check=check)

            def expect(name, condition):
                nonlocal checks
                if not condition:
                    raise AssertionError(name)
                checks += 1

            # Bootstrap test-only auth helpers and roles.
            sql("""
                CREATE ROLE authenticated;
                CREATE ROLE anon;
                CREATE ROLE service_role BYPASSRLS;
                CREATE SCHEMA auth;
                CREATE TYPE public.app_role AS ENUM
                  ('admin','accountant','sales','production','hr','employee','customer','vendor');
                CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
                  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
                $fn$;
                CREATE TABLE public.profiles(
                  id uuid PRIMARY KEY, status text NOT NULL, active_company_id uuid
                );
                CREATE TABLE public.companies(id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true);
                CREATE TABLE public.user_company_access(user_id uuid, company_id uuid, can_view boolean NOT NULL DEFAULT true);
                CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
                ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
                GRANT SELECT ON public.profiles TO authenticated;
                CREATE POLICY users_read_own_profile ON public.profiles
                  FOR SELECT TO authenticated USING (id=auth.uid());
                CREATE POLICY "admin insert profiles" ON public.profiles
                  FOR INSERT TO authenticated
                  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR id=auth.uid());
                CREATE FUNCTION public.is_approved(_user_id uuid) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
                    SELECT _user_id=auth.uid()
                      AND EXISTS (SELECT 1 FROM public.profiles p
                                  WHERE p.id=auth.uid() AND p.status='approved')
                  $fn$;
                CREATE FUNCTION public.current_company_id() RETURNS uuid
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
                    SELECT p.active_company_id
                    FROM public.profiles p JOIN public.companies c
                      ON c.id=p.active_company_id AND c.is_active
                    WHERE p.id=auth.uid()
                      AND EXISTS (SELECT 1 FROM public.user_company_access a
                                  WHERE a.user_id=auth.uid() AND a.company_id=p.active_company_id
                                    AND a.can_view)
                  $fn$;
                CREATE FUNCTION public.has_company_access(_company_id uuid) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
                    SELECT EXISTS (SELECT 1 FROM public.user_company_access
                                   WHERE user_id=auth.uid() AND company_id=_company_id AND can_view)
                  $fn$;
                CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
                    SELECT _user_id=auth.uid()
                      AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role=_role)
                  $fn$;
                CREATE FUNCTION public.current_user_roles() RETURNS SETOF public.app_role
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
                    SELECT role FROM public.user_roles WHERE user_id=auth.uid()
                  $fn$;
                CREATE FUNCTION public.set_active_company(_company_id uuid) RETURNS uuid
                  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
                  BEGIN
                    IF NOT public.has_company_access(_company_id) THEN RAISE EXCEPTION 'No company access'; END IF;
                    UPDATE public.profiles SET active_company_id=_company_id WHERE id=auth.uid();
                    RETURN _company_id;
                  END
                  $fn$;
                INSERT INTO public.companies(id,is_active) VALUES
                  ('10000000-0000-0000-0000-000000000001',true),
                  ('10000000-0000-0000-0000-000000000002',true);
                INSERT INTO public.profiles(id,status,active_company_id) VALUES
                  ('00000000-0000-0000-0000-000000000001','pending','10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000002','approved','10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000004','approved','10000000-0000-0000-0000-000000000001');
                INSERT INTO public.user_company_access(user_id,company_id,can_view) VALUES
                  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true),
                  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',true),
                  ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',true),
                  ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',true),
                  ('00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001',true);
                INSERT INTO public.user_roles(user_id,role) VALUES
                  ('00000000-0000-0000-0000-000000000001','admin'),
                  ('00000000-0000-0000-0000-000000000002','admin'),
                  ('00000000-0000-0000-0000-000000000004','sales');
                GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
            """, caller=False)

            scoped_tables = ["invoices", *LOCKED]
            for table in scoped_tables:
                sql(f"""
                    CREATE TABLE public.{table}(
                      id uuid PRIMARY KEY, company_id uuid NOT NULL, payload text NOT NULL
                    );
                    GRANT ALL PRIVILEGES ON TABLE public.{table}
                      TO authenticated, anon, service_role;
                    ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY;
                    CREATE POLICY company_scope_select ON public.{table}
                      FOR SELECT TO PUBLIC USING (
                        company_id=public.current_company_id()
                        AND public.has_company_access(company_id)
                      );
                    CREATE POLICY company_scope_insert ON public.{table}
                      FOR INSERT TO PUBLIC WITH CHECK (
                        company_id=public.current_company_id()
                        AND public.has_company_access(company_id)
                      );
                    CREATE POLICY company_scope_update ON public.{table}
                      FOR UPDATE TO PUBLIC USING (
                        company_id=public.current_company_id()
                        AND public.has_company_access(company_id)
                      ) WITH CHECK (
                        company_id=public.current_company_id()
                        AND public.has_company_access(company_id)
                      );
                    CREATE POLICY company_scope_delete ON public.{table}
                      FOR DELETE TO PUBLIC USING (
                        company_id=public.current_company_id()
                        AND public.has_company_access(company_id)
                      );
                    INSERT INTO public.{table}(id,company_id,payload) VALUES
                      ('{ROW_A}','{COMPANY_A}','A-record'),
                      ('{ROW_B}','{COMPANY_B}','B-record');
                """, caller=False)

            sql(migration.read_text(encoding="utf-8"), caller=False)
            if len(sys.argv) > 2:
                extra_migration = Path(sys.argv[2]).resolve()
                if not extra_migration.is_file():
                    raise FileNotFoundError(extra_migration)
                sql(extra_migration.read_text(encoding="utf-8"), caller=False)

            # Pending accounts can still see their own profile/status so the
            # application can render the pending-approval screen.
            profile = sql("SELECT status FROM public.profiles WHERE id=auth.uid()").stdout.strip()
            expect("pending user can read own profile status", profile == "pending")

            expect("pending role assignment is ignored by SECURITY DEFINER has_role",
                   sql("SELECT public.has_role(auth.uid(),'admin'::public.app_role)::text").stdout.strip() == "false")
            expect("pending membership cannot resolve an active company",
                   sql("SELECT coalesce(public.current_company_id()::text,'null')").stdout.strip() == "null")
            expect("pending membership cannot pass SECURITY DEFINER company access",
                   sql(f"SELECT public.has_company_access('{COMPANY_A}')::text").stdout.strip() == "false")
            expect("pending user roles are not returned by the SECURITY DEFINER role-list RPC",
                   sql("SELECT count(*) FROM public.current_user_roles()").stdout.strip() == "0")
            pending_switch = sql(
                f"SELECT public.set_active_company('{COMPANY_B}')",
                check=False,
            )
            expect("pending user cannot switch active company through SECURITY DEFINER RPC",
                   pending_switch.returncode != 0)
            expect("approved admin role remains available through shared helper",
                   sql("SELECT public.has_role(auth.uid(),'admin'::public.app_role)::text",
                       user=USER_APPROVED, company=COMPANY_A, approved=True).stdout.strip() == "true")
            expect("approved user retains active company context through shared helper",
                   sql("SELECT public.current_company_id()::text",
                       user=USER_APPROVED, company=COMPANY_A, approved=True).stdout.strip() == COMPANY_A)

            # The second migration removes the unnecessary self-insert
            # branch from the profile policy. Signup itself is still created by
            # the SECURITY DEFINER auth.users trigger, not by client profile INSERT.
            self_approval = sql(
                f"INSERT INTO public.profiles(id,status,active_company_id) VALUES "
                f"('{USER_MISSING_PROFILE}','approved','{COMPANY_A}')",
                user=USER_MISSING_PROFILE,
                check=False,
            )
            expect("a user without a profile cannot self-insert an approved profile",
                   self_approval.returncode != 0)
            expect("a non-admin cannot create a profile row for another user",
                   sql(
                       f"INSERT INTO public.profiles(id,status,active_company_id) VALUES "
                       f"('{ROW_B}','pending','{COMPANY_A}')",
                       user=USER_APPROVED_NONADMIN,
                       check=False,
                   ).returncode != 0)
            expect("approved admin retains profile provisioning capability",
                   sql(
                       f"INSERT INTO public.profiles(id,status,active_company_id) VALUES "
                       f"('{USER_MISSING_PROFILE}','pending','{COMPANY_A}')",
                       user=USER_APPROVED,
                       check=False,
                   ).returncode == 0)

            # The new restrictive policy must neutralize existing permissive
            # policies on normal company-scoped data, including writes.
            expect("pending user sees no invoices despite company membership",
                   sql("SELECT count(*) FROM public.invoices").stdout.strip() == "0")
            pending_insert = sql(
                f"INSERT INTO public.invoices(id,company_id,payload) VALUES "
                f"('30000000-0000-0000-0000-000000000001','{COMPANY_A}','forged')",
                check=False,
            )
            expect("pending user cannot insert into company-scoped finance data",
                   pending_insert.returncode != 0)
            pending_update = sql(
                f"UPDATE public.invoices SET payload='tampered' WHERE id='{ROW_A}' RETURNING id",
            )
            expect("pending user cannot update existing finance data", pending_update.stdout.strip() == "")
            pending_delete = sql(
                f"DELETE FROM public.invoices WHERE id='{ROW_A}' RETURNING id",
            )
            expect("pending user cannot delete existing finance data", pending_delete.stdout.strip() == "")

            # Approved users retain the original active-company behavior.
            expect("approved user retains access to own-company invoices",
                   sql("SELECT count(*) FROM public.invoices", user=USER_APPROVED,
                       company=COMPANY_A, approved=True).stdout.strip() == "1")
            expect("approved user cannot read company B rows while company A is active",
                   sql(f"SELECT count(*) FROM public.invoices WHERE id='{ROW_B}'",
                       user=USER_APPROVED, company=COMPANY_A, approved=True).stdout.strip() == "0")
            approved_insert = sql(
                f"INSERT INTO public.invoices(id,company_id,payload) VALUES "
                f"('30000000-0000-0000-0000-000000000002','{COMPANY_A}','approved')",
                user=USER_APPROVED, company=COMPANY_A, approved=True, check=False,
            )
            expect("approved user retains existing same-company create permission",
                   approved_insert.returncode == 0)

            # Client roles must not have non-row privileges that bypass RLS.
            # Service-role/database maintenance access remains intact.
            for db_role in ("anon", "authenticated"):
                for privilege in ("TRUNCATE", "REFERENCES", "TRIGGER"):
                    expect(
                        f"{db_role} cannot use {privilege} on invoices",
                        sql(
                            f"SELECT has_table_privilege('{db_role}','public.invoices','{privilege}')",
                            caller=False,
                        ).stdout.strip() == "f",
                    )
            for privilege in ("TRUNCATE", "REFERENCES", "TRIGGER"):
                expect(
                    f"service_role retains {privilege} on invoices",
                    sql(
                        f"SELECT has_table_privilege('service_role','public.invoices','{privilege}')",
                        caller=False,
                    ).stdout.strip() == "t",
                )
            truncate_attack = sql(
                "TRUNCATE TABLE public.invoices",
                db_role="authenticated",
                check=False,
            )
            expect("authenticated direct TRUNCATE is denied", truncate_attack.returncode != 0)

            # The ten unimplemented HR/AI governance tables become inaccessible
            # to browser/API roles until tailored policies are supplied.
            for table in LOCKED:
                expect(f"{table}: authenticated table privileges revoked",
                       sql(
                           f"SELECT has_table_privilege('authenticated','public.{table}','SELECT')",
                           caller=False,
                       ).stdout.strip() == "f")
                expect(f"{table}: anonymous table privileges revoked",
                       sql(
                           f"SELECT has_table_privilege('anon','public.{table}','SELECT')",
                           caller=False,
                       ).stdout.strip() == "f")
                # Server-side service role keeps its explicit grant.
                expect(f"{table}: service role retains server access",
                       sql(
                           f"SELECT has_table_privilege('service_role','public.{table}','SELECT')",
                           caller=False,
                       ).stdout.strip() == "t")
                policies = sql(
                    f"SELECT count(*) FROM pg_policies WHERE schemaname='public' "
                    f"AND tablename='{table}' AND policyname LIKE 'company_scope%'",
                    caller=False,
                ).stdout.strip()
                expect(f"{table}: broad company-only policies removed", policies == "0")

            # Every RLS table except profiles gets the shared approval guard.
            guard_count = sql(
                "SELECT count(*) FROM pg_policies WHERE schemaname='public' "
                "AND policyname='approved_profile_required'",
                caller=False,
            ).stdout.strip()
            expect("approval gate covers every RLS-protected public data table except profiles",
                   guard_count == str(len(scoped_tables)))

            print(f"PASS: {checks} isolated PostgreSQL approval/privilege checks.")
        finally:
            run(local(["pg_ctl", "-D", str(base / "data"), "-m", "immediate", "stop"]), check=False)


if __name__ == "__main__":
    main()
