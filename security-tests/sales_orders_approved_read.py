"""Exercise the selected read gate in disposable PostgreSQL, never the live DB.

Usage: python3 security-tests/sales_orders_approved_read.py <migration.sql>
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    migration = Path(sys.argv[1]).resolve().read_text()
    with tempfile.TemporaryDirectory(prefix="orders-read-rls-") as temp:
        base = Path(temp)
        socket = base / "socket"
        socket.mkdir()
        env = {k: v for k, v in os.environ.items()
               if not k.startswith(("PG", "SUPABASE_", "VITE_SUPABASE_"))
               and "DATABASE_URL" not in k}
        env.update(PGHOST=str(socket), PGPORT="55449", PGDATABASE="postgres", PGUSER="postgres")

        def run(args):
            return subprocess.run(args, env=env, capture_output=True, text=True, check=True)

        def local(args):
            return ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups", *args] if os.geteuid() == 0 else args

        if os.geteuid() == 0:
            subprocess.run(["chown", "-R", "lovable", temp], check=True)
        run(local(["initdb", "-D", str(base / "data"), "-A", "trust", "-U", "postgres", "--no-instructions"]))
        run(local(["pg_ctl", "-D", str(base / "data"), "-o", f"-k {socket} -p 55449 -h ''", "-l", str(base / "log"), "start"]))
        checks = 0
        try:
            def sql(query):
                return run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", query]).stdout.strip()

            sql("""
                CREATE ROLE authenticated; CREATE ROLE anon;
                CREATE ROLE service_role BYPASSRLS;
                CREATE SCHEMA auth;
                CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
                  SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
                CREATE FUNCTION public.is_approved(uuid) RETURNS boolean LANGUAGE sql AS $$
                  SELECT current_setting('test.status', true) = 'approved' $$;
                CREATE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql AS $$
                  SELECT current_setting('test.role', true) = $2 $$;
                CREATE TABLE public.sales_orders (id int, company_id int, created_by uuid, party_owner uuid);
                GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
                GRANT SELECT ON public.sales_orders TO authenticated, anon, service_role;
                ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
                CREATE POLICY "company_scope_sales_orders" ON public.sales_orders AS RESTRICTIVE
                  FOR ALL TO authenticated USING (company_id = 1) WITH CHECK (company_id = 1);
                CREATE POLICY "so read" ON public.sales_orders FOR SELECT TO authenticated USING (
                  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production')
                  OR (public.has_role(auth.uid(), 'sales') AND created_by = auth.uid())
                  OR (public.has_role(auth.uid(), 'customer') AND party_owner = auth.uid()));
                CREATE POLICY "so write admin/sales" ON public.sales_orders FOR ALL TO authenticated
                  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
                  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));
                INSERT INTO public.sales_orders VALUES
                  (1, 1, auth.uid(), auth.uid()), (2, 1, null, null), (3, 2, auth.uid(), auth.uid());
            """)

            def read(status, role):
                return sql(f"SET ROLE authenticated; SET test.status='{status}'; SET test.role='{role}'; SELECT count(*) FROM public.sales_orders;")

            # Demonstrate the original SELECT + ALL policy bypass.
            assert read("rejected", "sales") == "2"
            assert read("rejected", "production") == "2"
            checks += 2
            sql(migration)
            for role, expected in [("admin", "2"), ("sales", "2"), ("production", "2"), ("customer", "1"), ("hr", "0")]:
                assert read("approved", role) == expected, (role, "approved access changed")
                checks += 1
                for status in ("rejected", "pending", ""):
                    assert read(status, role) == "0", (role, status, "read bypass")
                    checks += 1
            assert sql("SET ROLE anon; SELECT count(*) FROM public.sales_orders;") == "0"
            assert sql("SET ROLE service_role; SELECT count(*) FROM public.sales_orders;") == "3"
            checks += 2
            print(f"PASS: {checks} isolated database checks (original bypass, retained-role rejection, pending/missing approval, approved role/ownership/company scope, anonymous and service access)")
        finally:
            run(local(["pg_ctl", "-D", str(base / "data"), "-m", "immediate", "stop"]))


if __name__ == "__main__":
    main()