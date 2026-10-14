"""Exercise the bank reconciliation RPC against disposable PostgreSQL only."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

USER_ID = "00000000-0000-0000-0000-000000000001"
COMPANY_A = "10000000-0000-0000-0000-000000000001"
COMPANY_B = "10000000-0000-0000-0000-000000000002"
ACCOUNT_A = "11000000-0000-0000-0000-000000000001"
ACCOUNT_A2 = "11000000-0000-0000-0000-000000000002"
ACCOUNT_B = "11000000-0000-0000-0000-000000000003"
BOOK = "20000000-0000-0000-0000-000000000001"
STATEMENT = "20000000-0000-0000-0000-000000000002"
MISMATCH_BOOK = "20000000-0000-0000-0000-000000000003"
MISMATCH_STMT = "20000000-0000-0000-0000-000000000004"
CROSS_COMPANY_STMT = "20000000-0000-0000-0000-000000000005"
OTHER_ACCOUNT_STMT = "20000000-0000-0000-0000-000000000006"


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
    with tempfile.TemporaryDirectory(prefix="bank-reconciliation-rpc-") as temp:
        base = Path(temp)
        socket = base / "socket"
        socket.mkdir()
        env.update(PGHOST=str(socket), PGPORT="55450", PGDATABASE="postgres", PGUSER="postgres")

        def run(args, *, check=True):
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
            def sql(query, *, role="accountant", company=COMPANY_A, caller=True, check=True):
                prefix = ""
                if caller:
                    prefix = (
                        f"SET ROLE authenticated; "
                        f"SET request.jwt.claim.sub='{USER_ID}'; "
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
                CREATE TYPE public.app_role AS ENUM ('admin','accountant','sales','production','hr','employee','customer','vendor');
                CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
                  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
                CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql AS
                  $$ SELECT nullif(current_setting('test.company', true), '')::uuid $$;
                CREATE FUNCTION public.has_company_access(_company_id uuid) RETURNS boolean LANGUAGE sql AS
                  $$ SELECT _company_id = public.current_company_id() $$;
                CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql AS
                  $$ SELECT coalesce(current_setting('test.role', true), 'sales') = _role::text $$;
                CREATE TABLE public.bank_accounts(id uuid PRIMARY KEY, company_id uuid);
                CREATE TABLE public.bank_transactions(
                  id uuid PRIMARY KEY,
                  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id),
                  source text NOT NULL,
                  debit numeric NOT NULL DEFAULT 0,
                  credit numeric NOT NULL DEFAULT 0,
                  reconciled_at timestamptz,
                  reconciled_with uuid
                );
                GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
                GRANT SELECT, UPDATE ON public.bank_transactions TO authenticated;
            """, caller=False)

            run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", str(migration)])

            sql(f"""
                INSERT INTO public.bank_accounts(id, company_id) VALUES
                  ('{ACCOUNT_A}', '{COMPANY_A}'),
                  ('{ACCOUNT_A2}', '{COMPANY_A}'),
                  ('{ACCOUNT_B}', '{COMPANY_B}');
                INSERT INTO public.bank_transactions(id, bank_account_id, source, debit, credit) VALUES
                  ('{BOOK}', '{ACCOUNT_A}', 'book', 125.00, 0),
                  ('{STATEMENT}', '{ACCOUNT_A}', 'statement', 125.00, 0),
                  ('{MISMATCH_BOOK}', '{ACCOUNT_A}', 'book', 100.00, 0),
                  ('{MISMATCH_STMT}', '{ACCOUNT_A}', 'statement', 0, 100.00),
                  ('{CROSS_COMPANY_STMT}', '{ACCOUNT_B}', 'statement', 125.00, 0),
                  ('{OTHER_ACCOUNT_STMT}', '{ACCOUNT_A2}', 'statement', 125.00, 0);
            """, caller=False)

            expect("authenticated can execute RPC",
                   sql("SELECT has_function_privilege('authenticated','public.match_bank_lines(uuid,uuid)','EXECUTE')", caller=False).stdout.strip() == "t")
            expect("anon cannot execute RPC",
                   sql("SELECT has_function_privilege('anon','public.match_bank_lines(uuid,uuid)','EXECUTE')", caller=False).stdout.strip() == "f")

            valid = sql(f"SELECT public.match_bank_lines('{BOOK}','{STATEMENT}')")
            expect("valid matching pair is reconciled reciprocally",
                   sql(f"SELECT count(*) FROM public.bank_transactions WHERE (id='{BOOK}' AND reconciled_with='{STATEMENT}') OR (id='{STATEMENT}' AND reconciled_with='{BOOK}')", caller=False).stdout.strip() == "2")

            mismatch = sql(f"SELECT public.match_bank_lines('{MISMATCH_BOOK}','{MISMATCH_STMT}')", check=False)
            expect("opposite debit/credit directions are rejected", mismatch.returncode != 0)
            expect("failed mismatch leaves both lines untouched",
                   sql(f"SELECT count(*) FROM public.bank_transactions WHERE id IN ('{MISMATCH_BOOK}','{MISMATCH_STMT}') AND reconciled_at IS NOT NULL", caller=False).stdout.strip() == "0")

            cross = sql(f"SELECT public.match_bank_lines('{MISMATCH_BOOK}','{CROSS_COMPANY_STMT}')", check=False)
            expect("cross-company transaction is rejected", cross.returncode != 0)
            other_account = sql(f"SELECT public.match_bank_lines('{MISMATCH_BOOK}','{OTHER_ACCOUNT_STMT}')", check=False)
            expect("different bank accounts are rejected", other_account.returncode != 0)
            wrong_source = sql(f"SELECT public.match_bank_lines('{STATEMENT}','{BOOK}')", check=False)
            expect("reversed source types are rejected", wrong_source.returncode != 0)
            unauthorized = sql(f"SELECT public.match_bank_lines('{MISMATCH_BOOK}','{MISMATCH_STMT}')", role="sales", check=False)
            expect("non-accounting roles are rejected", unauthorized.returncode != 0)

            print(f"Bank reconciliation RPC checks passed: {checks}")
        finally:
            run(local(["pg_ctl", "-D", str(base / "data"), "stop", "-m", "immediate"]), check=False)


if __name__ == "__main__":
    main()
