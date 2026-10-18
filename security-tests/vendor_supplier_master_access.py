"""Adversarial tests for vendor supplier-master write permissions.

Runs only on a disposable local PostgreSQL cluster. The child environment drops
PG, Supabase and DATABASE_URL settings so production data cannot be reached.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

VENDOR = "00000000-0000-0000-0000-000000000001"
OTHER_VENDOR = "00000000-0000-0000-0000-000000000002"
ADMIN = "00000000-0000-0000-0000-000000000003"
PRODUCTION = "00000000-0000-0000-0000-000000000004"
COMPANY_A = "10000000-0000-0000-0000-000000000001"
COMPANY_B = "10000000-0000-0000-0000-000000000002"
SUPPLIER_OWN = "20000000-0000-0000-0000-000000000001"
SUPPLIER_OTHER_VENDOR = "20000000-0000-0000-0000-000000000002"
SUPPLIER_OTHER_COMPANY = "20000000-0000-0000-0000-000000000003"


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
    with tempfile.TemporaryDirectory(prefix="vendor-supplier-master-") as temp:
        base = Path(temp)
        socket = base / "socket"
        socket.mkdir()
        env.update(PGHOST=str(socket), PGPORT="55452", PGDATABASE="postgres", PGUSER="postgres")

        def run(args, check=True):
            result = subprocess.run(args, env=env, text=True, capture_output=True, check=False)
            if check and result.returncode != 0:
                raise RuntimeError(
                    "Command failed: " + " ".join(args) + "\n"
                    + "stdout:\n" + result.stdout + "\nstderr:\n" + result.stderr
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
            "-o", f"-k {socket} -p 55452 -h ''",
            "-l", str(base / "server.log"), "start",
        ]))
        checks = 0
        try:
            def sql(query, *, user=VENDOR, company=COMPANY_A, caller=True, check=True):
                prefix = ""
                if caller:
                    prefix = (
                        "SET ROLE authenticated; "
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

            sql("""
                CREATE ROLE authenticated;
                CREATE ROLE anon;
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
                CREATE TABLE public.user_company_access(
                  user_id uuid, company_id uuid, can_view boolean NOT NULL DEFAULT true
                );
                CREATE TABLE public.user_roles(user_id uuid, role public.app_role);

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
                    WHERE p.id=auth.uid() AND p.status='approved'
                      AND EXISTS (SELECT 1 FROM public.user_company_access a
                                  WHERE a.user_id=auth.uid() AND a.company_id=p.active_company_id
                                    AND a.can_view)
                  $fn$;
                CREATE FUNCTION public.has_company_access(_company_id uuid) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
                    SELECT public.is_approved(auth.uid())
                      AND EXISTS (SELECT 1 FROM public.user_company_access a
                                  WHERE a.user_id=auth.uid() AND a.company_id=_company_id AND a.can_view)
                  $fn$;
                CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean
                  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
                    SELECT _user_id=auth.uid() AND public.is_approved(auth.uid())
                      AND EXISTS (SELECT 1 FROM public.user_roles r
                                  WHERE r.user_id=auth.uid() AND r.role=_role)
                  $fn$;

                CREATE TABLE public.suppliers(
                  id uuid PRIMARY KEY,
                  name text NOT NULL,
                  gstin text,
                  phone text,
                  email text,
                  address text,
                  notes text,
                  opening_balance numeric NOT NULL DEFAULT 0,
                  current_balance numeric NOT NULL DEFAULT 0,
                  tally_name text,
                  user_id uuid,
                  contact_person text,
                  state_code text,
                  pin_code text,
                  whatsapp_number text,
                  whatsapp_opt_in boolean NOT NULL DEFAULT false,
                  vendor_code text,
                  promo_opt_in boolean NOT NULL DEFAULT true,
                  company_id uuid
                );
                ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;
                GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
                GRANT SELECT, UPDATE ON public.suppliers TO authenticated;

                CREATE POLICY sup_read ON public.suppliers FOR SELECT TO authenticated
                  USING (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR public.has_role(auth.uid(),'production'::public.app_role));
                CREATE POLICY sup_vendor_read ON public.suppliers FOR SELECT TO authenticated
                  USING (public.has_role(auth.uid(),'vendor'::public.app_role) AND user_id=auth.uid());
                CREATE POLICY sup_write ON public.suppliers FOR ALL TO authenticated
                  USING (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR public.has_role(auth.uid(),'production'::public.app_role))
                  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR public.has_role(auth.uid(),'production'::public.app_role));
                CREATE POLICY sup_vendor_update_own ON public.suppliers FOR UPDATE TO authenticated
                  USING (public.has_role(auth.uid(),'vendor'::public.app_role) AND user_id=auth.uid())
                  WITH CHECK (public.has_role(auth.uid(),'vendor'::public.app_role) AND user_id=auth.uid());
                CREATE POLICY company_scope_suppliers ON public.suppliers AS RESTRICTIVE FOR ALL TO authenticated
                  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
                  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));
                CREATE POLICY approved_profile_required ON public.suppliers AS RESTRICTIVE FOR ALL TO authenticated
                  USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));

                INSERT INTO public.companies(id,is_active) VALUES
                  ('10000000-0000-0000-0000-000000000001',true),
                  ('10000000-0000-0000-0000-000000000002',true);
                INSERT INTO public.profiles(id,status,active_company_id) VALUES
                  ('00000000-0000-0000-0000-000000000001','approved','10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000002','approved','10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000003','approved','10000000-0000-0000-0000-000000000001'),
                  ('00000000-0000-0000-0000-000000000004','approved','10000000-0000-0000-0000-000000000001');
                INSERT INTO public.user_company_access(user_id,company_id,can_view) VALUES
                  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true),
                  ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',true),
                  ('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',true),
                  ('00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001',true);
                INSERT INTO public.user_roles(user_id,role) VALUES
                  ('00000000-0000-0000-0000-000000000001','vendor'),
                  ('00000000-0000-0000-0000-000000000002','vendor'),
                  ('00000000-0000-0000-0000-000000000003','admin'),
                  ('00000000-0000-0000-0000-000000000004','production');

                INSERT INTO public.suppliers(
                  id,name,gstin,phone,email,address,notes,opening_balance,current_balance,
                  user_id,contact_person,company_id
                ) VALUES
                  ('20000000-0000-0000-0000-000000000001','Vendor One','GST-OWN','9000000001','vendor@example.test','Own address','Own note',500,450,'00000000-0000-0000-0000-000000000001','Own contact','10000000-0000-0000-0000-000000000001'),
                  ('20000000-0000-0000-0000-000000000002','Vendor Two','GST-OTHER','9000000002','other@example.test','Other address','Other note',700,650,'00000000-0000-0000-0000-000000000002','Other contact','10000000-0000-0000-0000-000000000001'),
                  ('20000000-0000-0000-0000-000000000003','Vendor One Other Company','GST-OTHERCO','9000000003','otherco@example.test','Other company address','Other company note',900,800,'00000000-0000-0000-0000-000000000001','Other company contact','10000000-0000-0000-0000-000000000002');
            """, caller=False)

            sql(migration.read_text(encoding="utf-8"), caller=False)

            own = sql(f"SELECT count(*) FROM public.suppliers WHERE id='{SUPPLIER_OWN}'").stdout.strip()
            expect("vendor can read its own supplier profile for account viewing", own == "1")
            other_vendor = sql(f"SELECT count(*) FROM public.suppliers WHERE id='{SUPPLIER_OTHER_VENDOR}'").stdout.strip()
            expect("vendor cannot read another vendor's supplier profile", other_vendor == "0")
            other_company = sql(
                f"SELECT count(*) FROM public.suppliers WHERE id='{SUPPLIER_OTHER_COMPANY}'"
            ).stdout.strip()
            expect("vendor cannot read its supplier row from another company", other_company == "0")

            attack = sql(
                f"UPDATE public.suppliers SET name='Forged',gstin='FORGED-GST',"
                f"opening_balance=999999,current_balance=888888,phone='9999999999' "
                f"WHERE id='{SUPPLIER_OWN}' RETURNING id",
                check=False,
            )
            expect("vendor UPDATE receives no row after vendor write policy removal",
                   attack.returncode == 0 and attack.stdout.strip() == "")
            stable = sql(
                f"SELECT name || ':' || gstin || ':' || opening_balance::text || ':' || current_balance::text "
                f"FROM public.suppliers WHERE id='{SUPPLIER_OWN}'",
                caller=False,
            ).stdout.strip()
            expect("vendor attack does not alter supplier master or balances",
                   stable == "Vendor One:GST-OWN:500:450")

            other_update = sql(
                f"UPDATE public.suppliers SET current_balance=0 WHERE id='{SUPPLIER_OTHER_VENDOR}' RETURNING id",
                check=False,
            )
            expect("vendor cannot update another vendor's supplier row",
                   other_update.returncode == 0 and other_update.stdout.strip() == "")

            admin_update = sql(
                f"UPDATE public.suppliers SET current_balance=400 WHERE id='{SUPPLIER_OWN}' RETURNING current_balance",
                user=ADMIN,
            )
            expect("Admin retains supplier master maintenance", admin_update.stdout.strip() == "400")

            production_update = sql(
                f"UPDATE public.suppliers SET gstin='GST-PRODUCTION-UPDATED' WHERE id='{SUPPLIER_OWN}' RETURNING gstin",
                user=PRODUCTION,
            )
            expect("Production retains its existing supplier update policy",
                   production_update.stdout.strip() == "GST-PRODUCTION-UPDATED")

            vendor_policy = sql(
                "SELECT count(*) FROM pg_policies WHERE schemaname='public' "
                "AND tablename='suppliers' AND policyname='sup_vendor_update_own'",
                caller=False,
            ).stdout.strip()
            expect("vendor supplier UPDATE policy was removed", vendor_policy == "0")

            print(f"PASS: {checks} isolated PostgreSQL supplier-master authorization checks.")
        finally:
            run(local(["pg_ctl", "-D", str(base / "data"), "-m", "immediate", "stop"]), check=False)


if __name__ == "__main__":
    main()
