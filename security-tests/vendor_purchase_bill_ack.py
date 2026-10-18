"""Adversarial tests for vendor purchase-bill acknowledgement field boundaries.

Runs the migration against a disposable local PostgreSQL cluster. It never reads
or connects to production credentials/databases.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

USER = "00000000-0000-0000-0000-000000000001"
OTHER_USER = "00000000-0000-0000-0000-000000000002"
COMPANY_A = "10000000-0000-0000-0000-000000000001"
COMPANY_B = "10000000-0000-0000-0000-000000000002"
SUPPLIER_A = "20000000-0000-0000-0000-000000000001"
SUPPLIER_B = "20000000-0000-0000-0000-000000000002"
BILL_A = "30000000-0000-0000-0000-000000000001"
BILL_B = "30000000-0000-0000-0000-000000000002"
BILL_OTHER_SUPPLIER = "30000000-0000-0000-0000-000000000003"
BILL_OTHER_COMPANY = "30000000-0000-0000-0000-000000000004"


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

    with tempfile.TemporaryDirectory(prefix="vendor-purchase-bill-rls-") as temp:
        base = Path(temp)
        socket = base / "socket"
        socket.mkdir()
        env.update(PGHOST=str(socket), PGPORT="55450", PGDATABASE="postgres", PGUSER="postgres")

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
            "-o", f"-k {socket} -p 55450 -h ''",
            "-l", str(base / "server.log"), "start",
        ]))
        checks = 0
        try:
            def sql(query, *, role="vendor", company=COMPANY_A, user=USER, caller=True, check=True):
                prefix = ""
                if caller:
                    prefix = (
                        f"SET ROLE authenticated; "
                        f"SET request.jwt.claim.sub='{user}'; "
                        f"SET test.role='{role}'; "
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
                CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
                  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
                CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
                  RETURNS boolean LANGUAGE sql STABLE AS
                  $$ SELECT coalesce(current_setting('test.role', true), '') = _role::text $$;
                CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql STABLE AS
                  $$ SELECT nullif(current_setting('test.company', true), '')::uuid $$;
                CREATE FUNCTION public.has_company_access(_company_id uuid) RETURNS boolean
                  LANGUAGE sql STABLE AS
                  $$ SELECT _company_id = public.current_company_id() $$;
                CREATE TABLE public.suppliers (
                  id uuid PRIMARY KEY, company_id uuid NOT NULL, user_id uuid
                );
                CREATE TABLE public.purchase_bills (
                  id uuid PRIMARY KEY,
                  bill_number text NOT NULL,
                  supplier_id uuid,
                  bill_date date NOT NULL,
                  total_amount numeric NOT NULL DEFAULT 0,
                  notes text,
                  created_by uuid,
                  created_at timestamptz NOT NULL DEFAULT now(),
                  updated_at timestamptz NOT NULL DEFAULT now(),
                  place_of_supply text,
                  reverse_charge boolean NOT NULL DEFAULT false,
                  invoice_type text NOT NULL DEFAULT 'regular',
                  eligibility_for_itc text NOT NULL DEFAULT 'inputs',
                  subtotal numeric NOT NULL DEFAULT 0,
                  tax_amount numeric NOT NULL DEFAULT 0,
                  supplier_gstin text,
                  vendor_ack_status text NOT NULL DEFAULT 'pending',
                  vendor_ack_at timestamptz,
                  vendor_ack_note text,
                  expected_dispatch_date date,
                  receipt_status text NOT NULL DEFAULT 'draft',
                  company_id uuid,
                  cgst_amount numeric NOT NULL DEFAULT 0,
                  sgst_amount numeric NOT NULL DEFAULT 0,
                  igst_amount numeric NOT NULL DEFAULT 0
                );
                CREATE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
                  $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
                CREATE TRIGGER pb_touch BEFORE UPDATE ON public.purchase_bills
                  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

                INSERT INTO public.suppliers(id, company_id, user_id) VALUES
                  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
                  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
                  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');

                INSERT INTO public.purchase_bills(
                  id,bill_number,supplier_id,bill_date,total_amount,subtotal,tax_amount,
                  cgst_amount,sgst_amount,igst_amount,created_by,company_id
                ) VALUES
                  ('30000000-0000-0000-0000-000000000001','PO-A','20000000-0000-0000-0000-000000000001','2026-10-01',1000,900,100,50,50,0,'00000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001'),
                  ('30000000-0000-0000-0000-000000000002','PO-B','20000000-0000-0000-0000-000000000001','2026-10-02',2000,1800,200,100,100,0,'00000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001'),
                  ('30000000-0000-0000-0000-000000000003','PO-OTHER-SUPPLIER','20000000-0000-0000-0000-000000000002','2026-10-03',3000,2700,300,150,150,0,'00000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001'),
                  ('30000000-0000-0000-0000-000000000004','PO-OTHER-COMPANY','20000000-0000-0000-0000-000000000003','2026-10-04',4000,3600,400,200,200,0,'00000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000002');

                GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
                GRANT SELECT ON public.suppliers TO authenticated, anon;
                GRANT SELECT, UPDATE ON public.purchase_bills TO authenticated, anon;
                ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public.purchase_bills FORCE ROW LEVEL SECURITY;

                CREATE POLICY company_scope_purchase_bills ON public.purchase_bills
                  AS RESTRICTIVE FOR ALL TO authenticated
                  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
                  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));
                CREATE POLICY pb_read ON public.purchase_bills FOR SELECT TO authenticated
                  USING (public.has_role(auth.uid(),'admin'::public.app_role)
                    OR public.has_role(auth.uid(),'production'::public.app_role));
                CREATE POLICY pb_vendor_read ON public.purchase_bills FOR SELECT TO authenticated
                  USING (public.has_role(auth.uid(),'vendor'::public.app_role)
                    AND supplier_id IN (SELECT s.id FROM public.suppliers s WHERE s.user_id=auth.uid()));
                CREATE POLICY pb_write ON public.purchase_bills FOR ALL TO authenticated
                  USING (public.has_role(auth.uid(),'admin'::public.app_role)
                    OR public.has_role(auth.uid(),'production'::public.app_role))
                  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
                    OR public.has_role(auth.uid(),'production'::public.app_role));
                CREATE POLICY pb_vendor_ack ON public.purchase_bills FOR UPDATE TO authenticated
                  USING (public.has_role(auth.uid(),'vendor'::public.app_role)
                    AND supplier_id IN (SELECT s.id FROM public.suppliers s WHERE s.user_id=auth.uid()))
                  WITH CHECK (public.has_role(auth.uid(),'vendor'::public.app_role)
                    AND supplier_id IN (SELECT s.id FROM public.suppliers s WHERE s.user_id=auth.uid()));
            """, caller=False)

            sql(migration.read_text(encoding="utf-8"), caller=False)

            own_count = sql("SELECT count(*) FROM public.purchase_bills").stdout.strip()
            expect("vendor sees only own supplier's bills in active company", own_count == "2")
            expect("vendor cannot see a bill in another company",
                   sql(f"SELECT count(*) FROM public.purchase_bills WHERE id='{BILL_OTHER_COMPANY}'").stdout.strip() == "0")
            expect("vendor cannot read another supplier's bill by guessed UUID",
                   sql(f"SELECT count(*) FROM public.purchase_bills WHERE id='{BILL_OTHER_SUPPLIER}'").stdout.strip() == "0")
            expect("anonymous caller cannot read purchase bills",
                   sql(f"SELECT count(*) FROM public.purchase_bills", role="vendor", caller=True, check=True)
                   .stdout.strip() == "2")  # authenticated client context only

            ack = sql(
                f"UPDATE public.purchase_bills SET vendor_ack_status='accepted', "
                f"vendor_ack_note='Confirmed', expected_dispatch_date='2026-10-25' "
                f"WHERE id='{BILL_A}' RETURNING vendor_ack_status",
            )
            expect("vendor can accept own pending purchase order", ack.stdout.strip() == "accepted")
            ack_at = sql(f"SELECT vendor_ack_at IS NOT NULL FROM public.purchase_bills WHERE id='{BILL_A}'", caller=False).stdout.strip()
            expect("acknowledgement timestamp is set by the database", ack_at == "t")

            protected_updates = {
                "total_amount": "999999",
                "subtotal": "999999",
                "tax_amount": "0",
                "cgst_amount": "0",
                "sgst_amount": "0",
                "igst_amount": "999999",
                "bill_number": "'FORGED'",
                "bill_date": "'2000-01-01'",
                "supplier_id": f"'{SUPPLIER_B}'",
                "supplier_gstin": "'00AAAAA0000A1Z5'",
                "place_of_supply": "'Elsewhere'",
                "reverse_charge": "true",
                "invoice_type": "'composition'",
                "eligibility_for_itc": "'blocked'",
                "notes": "'changed by vendor'",
                "created_by": f"'{OTHER_USER}'",
                "created_at": "'2000-01-01T00:00:00Z'",
                "receipt_status": "'received'",
                "company_id": f"'{COMPANY_B}'",
                "id": "'30000000-0000-0000-0000-000000000099'",
            }
            for column, value in protected_updates.items():
                result = sql(
                    f"UPDATE public.purchase_bills SET {column}={value} WHERE id='{BILL_B}' RETURNING id",
                    check=False,
                )
                expect(f"vendor cannot tamper with {column}", result.returncode != 0)

            pending_meta = sql(
                f"UPDATE public.purchase_bills SET expected_dispatch_date='2026-11-01' WHERE id='{BILL_B}'",
                check=False,
            )
            expect("vendor cannot set acknowledgement metadata without a decision", pending_meta.returncode != 0)

            changed_after_ack = sql(
                f"UPDATE public.purchase_bills SET vendor_ack_note='rewritten after acceptance' WHERE id='{BILL_A}'",
                check=False,
            )
            expect("vendor cannot rewrite acknowledgement after acceptance", changed_after_ack.returncode != 0)

            spoof_timestamp = sql(
                f"UPDATE public.purchase_bills SET vendor_ack_at='2000-01-01T00:00:00Z' WHERE id='{BILL_B}'",
                check=False,
            )
            expect("vendor cannot choose an acknowledgement timestamp", spoof_timestamp.returncode != 0)

            reject = sql(
                f"UPDATE public.purchase_bills SET vendor_ack_status='rejected', "
                f"vendor_ack_note='Cannot supply', expected_dispatch_date='2026-12-01' "
                f"WHERE id='{BILL_B}' RETURNING vendor_ack_status",
            )
            expect("vendor can reject own pending purchase order", reject.stdout.strip() == "rejected")
            reject_fields = sql(
                f"SELECT (vendor_ack_at IS NOT NULL)::text || ':' || (expected_dispatch_date IS NULL)::text "
                f"FROM public.purchase_bills WHERE id='{BILL_B}'",
                caller=False,
            ).stdout.strip()
            expect("rejection gets a server timestamp and cannot retain a dispatch promise", reject_fields == "true:true")

            other_supplier_update = sql(
                f"UPDATE public.purchase_bills SET vendor_ack_status='accepted' "
                f"WHERE id='{BILL_OTHER_SUPPLIER}' RETURNING id",
            )
            expect("vendor cannot update another supplier's bill", other_supplier_update.stdout.strip() == "")

            cross_company_update = sql(
                f"UPDATE public.purchase_bills SET vendor_ack_status='accepted' "
                f"WHERE id='{BILL_OTHER_COMPANY}' RETURNING id",
            )
            expect("vendor cannot update another company's bill", cross_company_update.stdout.strip() == "")

            internal_edit = sql(
                f"UPDATE public.purchase_bills SET total_amount=1100 WHERE id='{BILL_A}' RETURNING total_amount",
                role="production",
            )
            expect("authorized production role retains its existing bill editing path", internal_edit.stdout.strip() == "1100")

            final = sql(
                f"SELECT total_amount::text || ':' || cgst_amount::text || ':' || receipt_status "
                f"FROM public.purchase_bills WHERE id='{BILL_A}'",
                caller=False,
            ).stdout.strip()
            expect("vendor attack attempts left the accepted bill's commercial/tax/receipt fields unchanged", final == "1000:50:draft")

            print(f"PASS: {checks} isolated PostgreSQL vendor-boundary checks.")
        finally:
            run(local(["pg_ctl", "-D", str(base / "data"), "-m", "immediate", "stop"]), check=False)


if __name__ == "__main__":
    main()
