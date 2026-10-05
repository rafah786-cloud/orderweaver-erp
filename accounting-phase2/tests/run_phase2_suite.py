#!/usr/bin/env python3
import os, subprocess, sys, threading
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from accounting_test_target import clean_psql_environment, load_managed_test_target, verify_and_display_identity

TARGET=load_managed_test_target('ALLOW_PHASE2_DATABASE_TESTS')
URL=TARGET.url
# This read-only identity probe is the only SQL allowed before the target is displayed and verified.
verify_and_display_identity(TARGET)

def sql(statement, quiet=True):
    command=['psql',URL,'-q','-v','ON_ERROR_STOP=1','-At','-c',"SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';"+statement]
    return subprocess.run(command,text=True,capture_output=True,check=True,env=clean_psql_environment()).stdout.strip()

def scalar(statement):
    rows=[line for line in sql(statement).splitlines() if line and line!='SET']
    return rows[-1] if rows else ''

def ledger(name): return scalar(f"SELECT id FROM ledger_accounts WHERE name='{name}'")
def expect_error(operation):
    try: operation(); return False
    except subprocess.CalledProcessError: return True

checks=[]
def check(name, condition, detail=''):
    checks.append((name,'PASS' if condition else 'FAIL',detail))

customer='10000000-0000-0000-0000-000000000001'; supplier='20000000-0000-0000-0000-000000000001'
cash=ledger('Cash'); bank=ledger('Bank'); opening=ledger('Sales')

customer_bill=scalar(f"SELECT id FROM create_opening_bill('customer','{customer}',NULL,'OPEN-C-1','2026-04-01','2026-04-30',1000,'{opening}','tally:open-c-1','INR')")
supplier_bill=scalar(f"SELECT id FROM create_opening_bill('supplier',NULL,'{supplier}','OPEN-S-1','2026-04-01','2026-04-30',800,'{opening}','tally:open-s-1','INR')")
check('customer_opening_bill',bool(customer_bill))
check('supplier_opening_bill',bool(supplier_bill))
opening_without_external=scalar(f"SELECT id FROM create_opening_bill('customer','{customer}',NULL,'MANUAL-OPEN-1','2026-04-01','2026-04-30',125,'{opening}',NULL,'INR')")
opening_without_external_retry=scalar(f"SELECT id FROM create_opening_bill('customer','{customer}',NULL,'MANUAL-OPEN-1','2026-04-01','2026-04-30',125,'{opening}',NULL,'INR')")
check('opening_bill_without_external_ref_idempotent',opening_without_external==opening_without_external_retry and scalar("SELECT count(*) FROM bills WHERE bill_reference='MANUAL-OPEN-1'")=='1')

sql("INSERT INTO invoices(invoice_number,party_id,invoice_date,due_date,subtotal,tax_amount,total_amount,dispatch_state_code,supplier_gstin) VALUES('INV-P2','10000000-0000-0000-0000-000000000001','2026-05-01','2026-05-31',1180,0,1180,'32','32AAAAA0000A1Z1')")
invoice_bill=scalar("SELECT id FROM bills WHERE bill_reference='INV-P2'")
check('sales_bill_atomic_link',bool(invoice_bill) and scalar(f"SELECT original_amount FROM bills WHERE id='{invoice_bill}'")=='1180.00')
sql("INSERT INTO purchase_bills(bill_number,supplier_id,bill_date,total_amount) VALUES('PB-P2','20000000-0000-0000-0000-000000000001','2026-05-02',590)")
purchase_bill=scalar("SELECT id FROM bills WHERE bill_reference='PB-P2'")
check('purchase_bill_atomic_link',bool(purchase_bill) and scalar(f"SELECT original_amount FROM bills WHERE id='{purchase_bill}'")=='590.00')

sql("INSERT INTO invoices(invoice_number,party_id,invoice_date,due_date,subtotal,tax_amount,total_amount,dispatch_state_code,supplier_gstin) VALUES('INV-VOID','10000000-0000-0000-0000-000000000001','2026-05-03','2026-06-02',200,0,200,'32','32AAAAA0000A1Z1')")
void_bill=scalar("SELECT id FROM bills WHERE bill_reference='INV-VOID'")
void_source=scalar(f"SELECT source_voucher_id FROM bills WHERE id='{void_bill}'")
sql(f"SELECT reverse_gl_voucher('{void_source}','2026-06-10','void invoice')")
check('reversed_source_cancels_bill',scalar(f"SELECT status FROM bills WHERE id='{void_bill}'")=='cancelled')
check('reversed_source_excluded_from_current_outstanding',scalar(f"SELECT count(*) FROM bill_outstanding_as_of('2026-06-10','customer') WHERE bill_id='{void_bill}'")=='0')
check('reversed_source_retained_in_historical_outstanding',scalar(f"SELECT count(*) FROM bill_outstanding_as_of('2026-06-09','customer') WHERE bill_id='{void_bill}'")=='1')

receipt=scalar(f"SELECT id FROM post_bill_settlement('receipt','2026-06-01','{cash}',jsonb_build_array(jsonb_build_object('bill_id','{invoice_bill}','amount',300,'allocation_type','against_ref')),'R1','settle:r1')")
check('partial_receipt',scalar(f"SELECT status||':'||(original_amount-coalesce((SELECT sum(effect*amount) FROM bill_allocations WHERE bill_id=b.id),0)) FROM bills b WHERE id='{invoice_bill}'")=='partial:880.00')
same=scalar(f"SELECT id FROM post_bill_settlement('receipt','2026-06-01','{cash}',jsonb_build_array(jsonb_build_object('bill_id','{invoice_bill}','amount',300,'allocation_type','against_ref')),'R1','settle:r1')")
check('idempotent_settlement',same==receipt and scalar("SELECT count(*) FROM bill_allocations WHERE idempotency_key LIKE 'settle:r1:%'")=='1')
sql(f"SELECT post_bill_settlement('receipt','2026-06-02','{cash}',jsonb_build_array(jsonb_build_object('bill_id','{invoice_bill}','amount',880,'allocation_type','against_ref')),'R2','settle:r2')")
check('full_settlement',scalar(f"SELECT status FROM bills WHERE id='{invoice_bill}'")=='settled')
check('overallocation_rejected',expect_error(lambda: sql(f"SELECT post_bill_settlement('receipt','2026-06-03','{cash}',jsonb_build_array(jsonb_build_object('bill_id','{invoice_bill}','amount',1,'allocation_type','against_ref')),'R3','settle:r3')")))
check('wrong_party_type_rejected',expect_error(lambda: sql(f"SELECT post_bill_settlement('payment','2026-06-03','{cash}',jsonb_build_array(jsonb_build_object('bill_id','{customer_bill}','amount',1,'allocation_type','against_ref')),'P3','settle:p3')")))

sql(f"SELECT post_bill_settlement('payment','2026-06-04','{bank}',jsonb_build_array(jsonb_build_object('bill_id','{supplier_bill}','amount',200,'allocation_type','against_ref'),jsonb_build_object('bill_id','{purchase_bill}','amount',100,'allocation_type','against_ref')),'P4','settle:p4')")
check('multi_bill_payment',scalar("SELECT count(*) FROM bill_allocations WHERE idempotency_key LIKE 'settle:p4:%'")=='2')

outstanding=scalar("SELECT coalesce(sum(outstanding_amount),0) FROM bill_outstanding_as_of('2026-06-30','customer')")
check('as_of_customer_outstanding',outstanding=='1125.00',outstanding)
ageing=scalar("SELECT total_outstanding FROM bill_ageing_as_of('2026-07-31','customer')")
check('customer_ageing_total',ageing=='1125.00',ageing)

# Concurrent attempts for the remaining 600 on one supplier bill: exactly one may settle it.
responses=[]
def concurrent(i):
    try:
        sql(f"SELECT post_bill_settlement('payment','2026-06-05','{bank}',jsonb_build_array(jsonb_build_object('bill_id','{supplier_bill}','amount',600,'allocation_type','against_ref')),'PC{i}','settle:concurrent:{i}')")
        responses.append('ok')
    except subprocess.CalledProcessError: responses.append('rejected')
threads=[threading.Thread(target=concurrent,args=(i,)) for i in range(2)]
for thread in threads: thread.start()
for thread in threads: thread.join()
check('concurrent_overallocation_lock',sorted(responses)==['ok','rejected'],str(responses))

# Reversing the receipt reopens the invoice bill through compensating allocations.
sql(f"SELECT reverse_gl_voucher('{receipt}','2026-06-06','reverse receipt')")
check('reversal_restores_outstanding',scalar(f"SELECT status FROM bills WHERE id='{invoice_bill}'")=='partial')

for name,status,detail in checks: print(f'{status}\t{name}\t{detail}')
failed=[row for row in checks if row[1]=='FAIL']
print(f'SUMMARY\t{len(checks)-len(failed)} PASS\t{len(failed)} FAIL')
sys.exit(1 if failed else 0)