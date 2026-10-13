"""Verify admin-only DML guards for generic ERP workbench tables on disposable PostgreSQL.

The harness deliberately installs broad permissive company-scope policies alongside the
restrictive guard to prove that another permissive policy cannot bypass the admin check.
Production environment/database variables are excluded from the child process.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

TABLES = [
    "work_centers", "mps_plans", "routings", "mrp_runs", "production_operations",
    "quality_plans", "quality_inspections", "quality_nonconformances",
    "maintenance_assets", "maintenance_plans", "maintenance_work_orders",
    "bom_revisions", "engineering_change_orders", "rfqs", "supplier_quotes",
    "warehouse_zones", "warehouse_bins", "stock_counts", "budgets",
    "bank_reconciliations", "fixed_assets", "crm_leads", "crm_opportunities",
    "crm_activities", "shipments", "sales_returns", "projects", "project_tasks",
    "workflow_definitions", "workflow_instances", "data_quality_issues",
    "ai_data_freshness",
]
USER_ID = "00000000-0000-0000-0000-000000000001"
COMPANY_A = "10000000-0000-0000-0000-000000000001"
COMPANY_B = "10000000-0000-0000-0000-000000000002"
COMPANY_C = "10000000-0000-0000-0000-000000000003"
ROW_A = "20000000-0000-0000-0000-000000000001"
ROW_B = "20000000-0000-0000-0000-000000000002"
ADMIN_ROW = "30000000-0000-0000-0000-000000000001"


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

    with tempfile.TemporaryDirectory(prefix="enterprise-workbench-rls-") as temp:
        base = Path(temp)
        socket = base / "socket"
        socket.mkdir()
        env.update(PGHOST=str(socket), PGPORT="55449", PGDATABASE="postgres", PGUSER="postgres")

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
            "-o", f"-k {socket} -p 55449 -h ''",
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
                  $$ SELECT coalesce(current_setting('test.role', true), 'sales') = _role::text $$;
                GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
            """, caller=False)

            for table in TABLES:
                sql(f"CREATE TABLE public.{table}(id uuid PRIMARY KEY, company_id uuid NOT NULL, notes text)")
                sql(f"GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO authenticated, anon")
                sql(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
                sql(f"""
                    CREATE POLICY company_scope_select ON public.{table}
                      FOR SELECT TO authenticated
                      USING (company_id = public.current_company_id() AND public.has_company_access(company_id));
                    CREATE POLICY company_scope_insert ON public.{table}
                      FOR INSERT TO authenticated
                      WITH CHECK (company_id = public.current_company_id() AND public.has_company_access(company_id));
                    CREATE POLICY company_scope_update ON public.{table}
                      FOR UPDATE TO authenticated
                      USING (company_id = public.current_company_id() AND public.has_company_access(company_id))
                      WITH CHECK (company_id = public.current_company_id() AND public.has_company_access(company_id));
                    CREATE POLICY company_scope_delete ON public.{table}
                      FOR DELETE TO authenticated
                      USING (company_id = public.current_company_id() AND public.has_company_access(company_id));
                    -- A second permissive policy simulates an overlapping legacy grant.
                    CREATE POLICY unrelated_permissive_insert ON public.{table}
                      FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company_id());
                    CREATE POLICY unrelated_permissive_update ON public.{table}
                      FOR UPDATE TO authenticated USING (company_id = public.current_company_id())
                      WITH CHECK (company_id = public.current_company_id());
                    CREATE POLICY unrelated_permissive_delete ON public.{table}
                      FOR DELETE TO authenticated USING (company_id = public.current_company_id());
                """)
                sql(f"""
                    INSERT INTO public.{table}(id, company_id, notes)
                    VALUES ('{ROW_A}', '{COMPANY_A}', 'company-a'), ('{ROW_B}', '{COMPANY_B}', 'company-b')
                """, caller=False)

            sql(migration.read_text(), caller=False)

            for table in TABLES:
                expect(f"{table}: same-company select remains available",
                       sql(f"SELECT count(*) FROM public.{table}").stdout.strip() == "1")
                expect(f"{table}: other-company rows remain hidden",
                       sql(f"SELECT count(*) FROM public.{table}", company=COMPANY_C).stdout.strip() == "0")
                insert = (
                    f"INSERT INTO public.{table}(id, company_id, notes) "
                    f"VALUES ('{ADMIN_ROW}', '{COMPANY_A}', 'probe')"
                )
                denied_insert = sql(insert, role="sales", check=False)
                expect(f"{table}: non-admin insert denied despite permissive policies",
                       denied_insert.returncode != 0)
                expect(f"{table}: non-admin update denied",
                       sql(f"UPDATE public.{table} SET notes='changed' WHERE id='{ROW_A}' RETURNING id").stdout.strip() == "")
                expect(f"{table}: non-admin delete denied",
                       sql(f"DELETE FROM public.{table} WHERE id='{ROW_A}' RETURNING id").stdout.strip() == "")
                expect(f"{table}: pending admin cannot write",
                       sql(insert, role="admin", approved=False, check=False).returncode != 0)
                expect(f"{table}: admin insert allowed",
                       sql(insert, role="admin").returncode == 0)
                expect(f"{table}: admin update allowed",
                       sql(f"UPDATE public.{table} SET notes='updated' WHERE id='{ADMIN_ROW}' RETURNING id",
                           role="admin").stdout.strip() == ADMIN_ROW)
                expect(f"{table}: admin cannot move a row to another company",
                       sql(f"UPDATE public.{table} SET company_id='{COMPANY_B}' WHERE id='{ROW_A}' RETURNING id",
                           role="admin", check=False).returncode != 0)
                expect(f"{table}: admin delete allowed",
                       sql(f"DELETE FROM public.{table} WHERE id='{ADMIN_ROW}' RETURNING id",
                           role="admin").stdout.strip() == ADMIN_ROW)

            print(f"PASS: {checks} isolated PostgreSQL RLS checks across {len(TABLES)} enterprise workbench tables.")
        finally:
            run(local(["pg_ctl", "-D", str(base / "data"), "-m", "immediate", "stop"]), check=False)


if __name__ == "__main__":
    main()
