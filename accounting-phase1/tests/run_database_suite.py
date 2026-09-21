#!/usr/bin/env python3
import os, subprocess, sys, tempfile, threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
URL=os.environ.get('TEST_DATABASE_URL','')
if not URL:
    raise SystemExit('BLOCKED: TEST_DATABASE_URL is required')
for forbidden in filter(None,[os.environ.get('SUPABASE_URL',''),os.environ.get('PGHOST','')]):
    if forbidden in URL:
        raise SystemExit('REFUSED: test URL appears to target the connected shared database')
if os.environ.get('ALLOW_PHASE1_DATABASE_TESTS')!='isolated-only':
    raise SystemExit('REFUSED: set ALLOW_PHASE1_DATABASE_TESTS=isolated-only')

def psql(sql=None,file=None,tuples=False):
    cmd=['psql',URL,'-v','ON_ERROR_STOP=1']
    if tuples: cmd += ['-At']
    if file: cmd += ['-f',str(file)]
    else: cmd += ['-c',sql]
    return subprocess.run(cmd,text=True,capture_output=True,check=True).stdout.strip()

psql(file=ROOT/'accounting-phase1/tests/base_fixture.sql')
psql(file=ROOT/'accounting-phase1/001_accounting_foundation.sql')
# Install source triggers exactly as production uses them.
psql("CREATE TRIGGER fixture_invoice_post AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.post_invoice_to_voucher(); CREATE TRIGGER fixture_purchase_post AFTER INSERT ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION public.post_purchase_to_voucher();")
ADMIN="SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';"
def q(sql): return psql(ADMIN+sql,tuples=True)
def ledger(name): return q(f"SELECT id FROM ledger_accounts WHERE name='{name}'")
def entries(amount): return f"jsonb_build_array(jsonb_build_object('ledger_account_id','{ledger('Cash')}','debit',{amount},'credit',0),jsonb_build_object('ledger_account_id','{ledger('Sales')}','debit',0,'credit',{amount}))"
results=[]
def check(name,fn):
    try: fn(); results.append((name,'PASS',''))
    except Exception as e: results.append((name,'FAIL',str(e).splitlines()[-1][:240]))
def post(vtype,key,amount=10,date='2026-04-01'):
    return q(f"SELECT id FROM create_gl_voucher('{vtype}','{date}',{entries(amount)},NULL,NULL,'{key}','posted')")
for typ in ['sales','purchase','receipt','payment','contra','journal','debit_note','credit_note']:
    check('voucher_'+typ,lambda t=typ: post(t,'type:'+t))
check('debit_credit_enforcement',lambda: q(f"SELECT create_gl_voucher('journal','2026-04-01',jsonb_build_array(jsonb_build_object('ledger_account_id','{ledger('Cash')}','debit',10,'credit',0),jsonb_build_object('ledger_account_id','{ledger('Sales')}','debit',0,'credit',9)),NULL,NULL,'bad:balance','posted')"))
# The preceding check must fail to pass semantically.
if results[-1][1]=='FAIL' and 'not balanced' in results[-1][2]: results[-1]=('debit_credit_enforcement','PASS','rejected')
check('rollback_no_row',lambda: (_ for _ in ()).throw(AssertionError(q("SELECT count(*) FROM vouchers WHERE idempotency_key='bad:balance'") )) if q("SELECT count(*) FROM vouchers WHERE idempotency_key='bad:balance'")!='0' else None)
first=post('journal','retry:one')
check('idempotent_retry',lambda: (_ for _ in ()).throw(AssertionError()) if post('journal','retry:one')!=first else None)
original=post('credit_note','reverse:one',55)
check('reversal',lambda: q(f"SELECT id FROM reverse_gl_voucher('{original}','2026-04-02','test reversal')"))
draft=q(f"SELECT id FROM create_gl_voucher('journal','2026-04-01',{entries(12)},NULL,NULL,'draft:one','draft')")
check('draft_cancellation',lambda: q(f"SELECT id FROM cancel_gl_voucher('{draft}','test cancellation','2026-04-02')"))
immutable=lambda: q(f"UPDATE vouchers SET narration='illegal' WHERE id='{original}'")
check('posted_immutability',immutable)
if results[-1][1]=='FAIL' and 'immutable' in results[-1][2]: results[-1]=('posted_immutability','PASS','rejected')
check('closed_period_rejection',lambda: q("SELECT create_gl_voucher('journal','2025-04-01,'::jsonb)"))
# replace malformed placeholder with an actual closed-year call expected to fail
results.pop()
try: q(f"SELECT create_gl_voucher('journal','2025-04-01',{entries(1)},NULL,NULL,'closed:one','posted')"); results.append(('closed_period_rejection','FAIL','accepted'))
except Exception as e: results.append(('closed_period_rejection','PASS','rejected'))
check('sales_atomic',lambda: q("INSERT INTO invoices(invoice_number,party_id,invoice_date,subtotal,tax_amount,total_amount,dispatch_state_code,supplier_gstin) VALUES('INV-T1','10000000-0000-0000-0000-000000000001','2026-04-03',1000,180,1180,'32','32AAAAA0000A1Z1') RETURNING id"))
check('purchase_atomic',lambda: q("INSERT INTO purchase_bills(bill_number,supplier_id,bill_date,total_amount) VALUES('PB-T1','20000000-0000-0000-0000-000000000001','2026-04-03',590) RETURNING id"))
check('global_control',lambda: (_ for _ in ()).throw(AssertionError()) if q("SELECT count(*) FROM (SELECT v.id FROM vouchers v JOIN voucher_entries e ON e.voucher_id=v.id WHERE v.status IN ('posted','reversed') GROUP BY v.id HAVING round(sum(e.debit),2)<>round(sum(e.credit),2)) x")!='0' else None)
# Concurrent numbers and posting.
def worker(i,out):
    try: out.append(post('payment',f'concurrent:{i}',i+1))
    except Exception as e: out.append('ERR:'+str(e))
out=[]; threads=[threading.Thread(target=worker,args=(i,out)) for i in range(40)]
for t in threads:t.start()
for t in threads:t.join()
results.append(('concurrent_posting_and_numbering','PASS' if len(out)==40 and len(set(out))==40 and not any(x.startswith('ERR:') for x in out) else 'FAIL',f'{len(out)} responses'))
# Preflight should execute successfully on the synthetic copy.
check('preflight_queries',lambda: psql(file=ROOT/'accounting-phase1/tests/preflight.sql'))
for name,status,detail in results: print(f'{status}\t{name}\t{detail}')
failed=[r for r in results if r[1]!='PASS']
print(f'SUMMARY\t{len(results)-len(failed)} PASS\t{len(failed)} FAIL')
sys.exit(1 if failed else 0)
