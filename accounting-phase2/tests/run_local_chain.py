#!/usr/bin/env python3
"""Disposable PostgreSQL-only canonical accounting chain; never connects to Cloud."""
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADMIN = "SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';"
CUSTOMER = "10000000-0000-0000-0000-000000000001"

with tempfile.TemporaryDirectory(prefix="accounting-chain-") as location:
    base = Path(location)
    data = base / "data"
    socket = base / "socket"
    socket.mkdir()
    # libpq must not inherit production/preview credentials or a managed target.
    env = {key: value for key, value in os.environ.items() if not key.startswith(("PG", "SUPABASE_", "VITE_SUPABASE_")) and key not in {"DATABASE_URL", "TEST_DATABASE_URL", "MANAGED_TEST_DATABASE_URL"}}
    env.update(PGHOST=str(socket), PGPORT="55439", PGDATABASE="postgres", PGUSER="postgres")

    def command(args, *, check=True):
        result = subprocess.run(args, env=env, text=True, capture_output=True)
        if check and result.returncode:
            raise RuntimeError(result.stderr.strip())
        return result

    # initdb refuses root; run the isolated server under a local, unprivileged OS user.
    if os.geteuid() == 0:
        subprocess.run(["chown", "-R", "lovable", str(base)], check=True)
        def local(args): return ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups", *args]
    else:
        def local(args): return args
    command(local(["initdb", "-D", str(data), "-A", "trust", "-U", "postgres", "--no-instructions"]))
    command(local(["pg_ctl", "-D", str(data), "-o", f"-k {socket} -p 55439 -h ''", "-l", str(base / "server.log"), "start"]))
    try:
        def sql(query=None, file=None, *, admin=True):
            if file is not None:
                args = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", str(file)]
            else:
                args = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", (ADMIN if admin else "") + query]
            output = [line for line in command(args).stdout.strip().splitlines() if line not in {"SET", "INSERT 0 1", "UPDATE 1", "CREATE TRIGGER"}]
            return output[-1] if query is not None and output else None

        def rejected(query):
            try:
                sql(query)
            except RuntimeError:
                return True
            return False

        sql(file=ROOT / "accounting-phase1/tests/base_fixture.sql")
        sql(file=ROOT / "accounting-phase1/001_accounting_foundation.sql")
        sql(file=ROOT / "accounting-phase2/001_billwise_accounting.sql")
        sql("CREATE TRIGGER fixture_invoice_post AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.post_invoice_to_voucher();")
        sql("CREATE TRIGGER fixture_purchase_post AFTER INSERT ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION public.post_purchase_to_voucher();")
        print("TARGET: disposable local PostgreSQL socket; synthetic fixtures only")

        def check(name, ok):
            print(f"{'PASS' if ok else 'FAIL'} {name}")
            if not ok: raise AssertionError(name)

        check("tax without verified split rolls back invoice and GL", rejected(f"INSERT INTO invoices(invoice_number,party_id,invoice_date,subtotal,tax_amount,total_amount) VALUES ('CHAIN-TAX','{CUSTOMER}','2026-04-02',100,18,118)"))
        check("tax rollback leaves no document or voucher", sql("SELECT (SELECT count(*) FROM invoices WHERE invoice_number='CHAIN-TAX')::text || ':' || (SELECT count(*) FROM vouchers WHERE reference='CHAIN-TAX')") == "0:0")
        check("closed FY invoice rolls back completely", rejected(f"INSERT INTO invoices(invoice_number,party_id,invoice_date,subtotal,tax_amount,total_amount) VALUES ('CHAIN-CLOSED','{CUSTOMER}','2026-02-02',100,0,100)") and sql("SELECT count(*) FROM invoices WHERE invoice_number='CHAIN-CLOSED'") == "0")
        invoice = sql(f"INSERT INTO invoices(invoice_number,party_id,invoice_date,due_date,subtotal,tax_amount,total_amount) VALUES ('CHAIN-1','{CUSTOMER}','2026-04-02','2026-05-02',1180,0,1180) RETURNING id")
        check("invoice-to-party-ledger-to-balanced-GL-to-receivable", sql(f"SELECT count(*) FROM bills b JOIN vouchers v ON v.id=b.source_voucher_id JOIN voucher_entries e ON e.id=b.source_voucher_entry_id JOIN ledger_accounts l ON l.id=e.ledger_account_id WHERE v.source_table='invoices' AND v.source_id='{invoice}' AND v.status='posted' AND l.mapped_party_id='{CUSTOMER}' AND e.debit=1180 AND b.original_amount=e.debit AND b.ledger_account_id=l.id") == "1")
        bill = sql(f"SELECT id FROM bills WHERE bill_reference='CHAIN-1'")
        cash = sql("SELECT id FROM ledger_accounts WHERE name='Cash'")
        def receipt(key, amount):
            return f"SELECT id FROM post_bill_settlement('receipt','2026-04-03','{cash}',jsonb_build_array(jsonb_build_object('bill_id','{bill}','amount',{amount},'allocation_type','against_ref')),'CHAIN-1','{key}')"
        check("duplicate bill in one receipt rejected before GL", rejected(f"SELECT post_bill_settlement('receipt','2026-04-03','{cash}',jsonb_build_array(jsonb_build_object('bill_id','{bill}','amount',100),jsonb_build_object('bill_id','{bill}','amount',100)),'CHAIN-1','chain:duplicate')"))
        check("duplicate rollback leaves no voucher", sql("SELECT count(*) FROM vouchers WHERE idempotency_key='chain:duplicate'") == "0")
        receipt_id = sql(receipt("chain:receipt1", 300))
        check("receipt GL linked to bill-wise allocation", sql(f"SELECT count(*) FROM bill_allocations a JOIN voucher_entries e ON e.id=a.settlement_voucher_entry_id JOIN vouchers v ON v.id=e.voucher_id JOIN bills b ON b.id=a.bill_id WHERE a.bill_id='{bill}' AND a.settlement_voucher_id='{receipt_id}' AND v.voucher_type='receipt' AND e.ledger_account_id=b.ledger_account_id AND e.credit=300 AND a.amount=300") == "1")
        check("partial receivable is 880", sql(f"SELECT outstanding_amount FROM bill_outstanding_as_of('2026-04-03','customer') WHERE bill_id='{bill}'") == "880.00")
        check("retry posts no second receipt", sql(receipt("chain:receipt1", 300)) == receipt_id and sql("SELECT count(*) FROM vouchers WHERE idempotency_key='chain:receipt1'") == "1")
        check("over-allocation rolls back", rejected(receipt("chain:overpay", 881)) and sql("SELECT count(*) FROM vouchers WHERE idempotency_key='chain:overpay'") == "0")
        reversal = sql(f"SELECT id FROM reverse_gl_voucher('{receipt_id}','2026-04-04','reverse test receipt')")
        check("reversal restores receivable without editing original allocation", sql(f"SELECT outstanding_amount FROM bill_outstanding_as_of('2026-04-04','customer') WHERE bill_id='{bill}'") == "1180.00" and sql(f"SELECT count(*) FROM bill_allocations WHERE bill_id='{bill}' AND effect=-1 AND settlement_voucher_id='{reversal}'") == "1")
        check("historical as-of remains partial", sql(f"SELECT outstanding_amount FROM bill_outstanding_as_of('2026-04-03','customer') WHERE bill_id='{bill}'") == "880.00")
        check("posted GL immutable", rejected(f"UPDATE voucher_entries SET credit=1 WHERE voucher_id='{receipt_id}'"))
        source = sql(f"SELECT source_voucher_id FROM bills WHERE id='{bill}'")
        sql(f"SELECT reverse_gl_voucher('{source}','2026-04-05','void source invoice')")
        check("source reversal cancels bill, not historical balance", sql(f"SELECT status FROM bills WHERE id='{bill}'") == "cancelled" and sql(f"SELECT count(*) FROM bill_outstanding_as_of('2026-04-04','customer') WHERE bill_id='{bill}'") == "1" and sql(f"SELECT count(*) FROM bill_outstanding_as_of('2026-04-05','customer') WHERE bill_id='{bill}'") == "0")
        check("all posted voucher legs balance", sql("SELECT count(*) FROM (SELECT v.id FROM vouchers v JOIN voucher_entries e ON e.voucher_id=v.id WHERE v.status IN ('posted','reversed') GROUP BY v.id HAVING sum(e.debit)<>sum(e.credit)) unbalanced") == "0")
        supplier = "20000000-0000-0000-0000-000000000001"
        sql(f"INSERT INTO purchase_bills(bill_number,supplier_id,bill_date,total_amount) VALUES('CHAIN-PURCHASE','{supplier}','2026-04-02',590)")
        supplier_bill = sql("SELECT id FROM bills WHERE bill_reference='CHAIN-PURCHASE'")
        check("purchase-to-supplier-ledger-to-payable", sql(f"SELECT count(*) FROM bills b JOIN voucher_entries e ON e.id=b.source_voucher_entry_id JOIN vouchers v ON v.id=e.voucher_id JOIN ledger_accounts l ON l.id=e.ledger_account_id WHERE b.id='{supplier_bill}' AND v.voucher_type='purchase' AND l.mapped_supplier_id='{supplier}' AND e.credit=590 AND b.original_amount=e.credit") == "1")
        bank = sql("SELECT id FROM ledger_accounts WHERE name='Bank'")
        payment = sql(f"SELECT id FROM post_bill_settlement('payment','2026-04-03','{bank}',jsonb_build_array(jsonb_build_object('bill_id','{supplier_bill}','amount',200)),'CHAIN-PAY','chain:payment1')")
        check("payment allocates payable and balances GL", sql(f"SELECT outstanding_amount FROM bill_outstanding_as_of('2026-04-03','supplier') WHERE bill_id='{supplier_bill}'") == "390.00" and sql(f"SELECT sum(debit)-sum(credit) FROM voucher_entries WHERE voucher_id='{payment}'") == "0")
        sql(f"SELECT reverse_gl_voucher('{payment}','2026-04-04','reverse supplier payment')")
        check("payment reversal restores payable", sql(f"SELECT outstanding_amount FROM bill_outstanding_as_of('2026-04-04','supplier') WHERE bill_id='{supplier_bill}'") == "590.00")
        def concurrent_receipt(i):
            try:
                sql(f"SELECT post_bill_settlement('receipt','2026-04-05','{cash}',jsonb_build_array(jsonb_build_object('bill_id','{bill}','amount',800)),'CHAIN-RACE','chain:race:{i}')")
                return "posted"
            except RuntimeError:
                return "rejected"
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(concurrent_receipt, range(2)))
        # The source invoice is already reversed, so neither receipt may post.
        check("reversed source rejects concurrent settlements", results == ["rejected", "rejected"] and sql("SELECT count(*) FROM vouchers WHERE idempotency_key LIKE 'chain:race:%'") == "0")
    finally:
        command(local(["pg_ctl", "-D", str(data), "stop", "-m", "immediate"]))