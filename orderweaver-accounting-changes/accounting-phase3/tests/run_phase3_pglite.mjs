import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../001_inventory_ledger.sql", import.meta.url), "utf8");
const results = [];
const check = (name, ok, expected, actual, module) => results.push({ name, status: ok ? "PASS" : "FAIL", expected, actual, module });

const fixture = `
CREATE TYPE public.voucher_type AS ENUM ('journal','sales','purchase','receipt','payment','contra','debit_note','credit_note');
CREATE TABLE public.godowns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, code text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now());
CREATE TABLE public.raw_materials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, unit text, current_stock numeric DEFAULT 0);
CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, unit text DEFAULT 'pcs',
  mapped_raw_material_id uuid, mapped_model_id uuid, is_active boolean DEFAULT true
);
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), movement_date date DEFAULT CURRENT_DATE,
  stock_item_id uuid, godown_id uuid, movement_type text, quantity numeric, rate numeric DEFAULT 0,
  amount numeric DEFAULT 0, source_table text, source_id uuid, narration text
);
CREATE TABLE public.stock_valuation_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), allow_negative_stock boolean DEFAULT false);
INSERT INTO public.stock_valuation_settings(allow_negative_stock) VALUES (false);
CREATE TABLE public.purchase_bills (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bill_number text);
CREATE TABLE public.purchase_bill_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_bill_id uuid, raw_material_id uuid, quantity numeric, unit_price numeric);
CREATE TABLE public.sales_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.sales_order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sales_order_id uuid, model_id uuid, quantity numeric);
CREATE TABLE public.ledger_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_number text, voucher_type public.voucher_type,
  voucher_date date, narration text, source_table text, source_id uuid, UNIQUE(source_table, source_id)
);
CREATE TABLE public.voucher_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid, ledger_account_id uuid,
  debit numeric DEFAULT 0, credit numeric DEFAULT 0, line_order int DEFAULT 0
);
CREATE TABLE public.financial_years (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, start_date date, end_date date, is_locked boolean DEFAULT false);
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subtotal numeric, tax_amount numeric,
  dispatch_state_code text, supplier_gstin text
);
INSERT INTO public.godowns(id, name) VALUES ('00000000-0000-0000-0000-000000000010','Main');
INSERT INTO public.raw_materials(id, name, unit, current_stock) VALUES ('00000000-0000-0000-0000-000000000021','Foam','kg',5);
INSERT INTO public.stock_items(id, name, mapped_raw_material_id) VALUES ('00000000-0000-0000-0000-000000000031','Foam','00000000-0000-0000-0000-000000000021');
INSERT INTO public.stock_movements(stock_item_id, godown_id, movement_type, quantity, rate, amount, narration)
VALUES ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000010','opening',5,10,50,'historical opening');
`;

const db = new PGlite();
await db.exec(fixture);
await db.exec(migration);

const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const fails = async (sql) => { try { await db.exec(sql); return false; } catch { try { await db.exec("ROLLBACK"); } catch { /* autocommit */ } return true; } };

const item = "00000000-0000-0000-0000-000000000031";
const godown = "00000000-0000-0000-0000-000000000010";
const before = await one(`SELECT current_stock FROM raw_materials WHERE id='00000000-0000-0000-0000-000000000021'`);
check("existing stock preserved before new posts", Number(before.current_stock) === 5, "5", before.current_stock, "inventory");

await db.exec(`SELECT post_stock_receipt('${item}','${godown}',10,20,'2026-05-01','rcpt-1')`);
await db.exec(`SELECT post_stock_receipt('${item}','${godown}',10,20,'2026-05-01','rcpt-1')`);
const receipts = await one(`SELECT count(*)::int AS n FROM stock_postings WHERE idempotency_key='rcpt-1'`);
check("idempotent receipt", receipts.n === 1, "1 posting", receipts.n, "inventory");
const avg = await one(`SELECT weighted_avg_rate('${item}','${godown}') AS rate`);
check("weighted average", Number(avg.rate) === 16.666667, "16.666667", avg.rate, "inventory");

const zero = await fails(`SELECT post_stock_receipt('${item}','${godown}',5,0,'2026-05-02','zero')`);
check("zero-value receipt rejected", zero, "exception", zero, "inventory");

await db.exec(`SELECT reserve_stock('${item}','${godown}',12,'sales_orders','00000000-0000-0000-0000-000000000041','res-1')`);
const blocked = await fails(`SELECT post_stock_issue('${item}','${godown}',10,'2026-05-03','too-much')`);
check("negative stock blocked while reserved", blocked, "exception", blocked, "inventory");
await db.exec(`UPDATE stock_reservations SET status='released' WHERE idempotency_key='res-1'`);
await db.exec(`SELECT post_stock_issue('${item}','${godown}',3,'2026-05-03','dispatch-1')`);
const onHand = await one(`SELECT stock_on_hand('${item}','${godown}') AS qty`);
check("dispatch reduces stock", Number(onHand.qty) === 12, "12", onHand.qty, "sales dispatch");

await db.exec(`INSERT INTO godowns(id,name) VALUES ('00000000-0000-0000-0000-000000000011','Store')`);
await db.exec(`SELECT post_stock_transfer('${item}','${godown}','00000000-0000-0000-0000-000000000011',2,'2026-05-04','xfer-1')`);
const dest = await one(`SELECT stock_on_hand('${item}','00000000-0000-0000-0000-000000000011') AS qty`);
check("godown transfer pairs out and in", Number(dest.qty) === 2, "2", dest.qty, "inventory");

const foam = item;
await db.exec(`INSERT INTO stock_items(id,name) VALUES ('00000000-0000-0000-0000-000000000032','Mattress')`);
await db.exec(`SELECT post_production_stock('00000000-0000-0000-0000-000000000032',2,'${godown}','2026-05-05','prd-1','[{"item_id":"${foam}","qty":4}]'::jsonb)`);
const fg = await one(`SELECT quantity, amount FROM stock_movements WHERE stock_item_id='00000000-0000-0000-0000-000000000032' AND movement_type='production_in'`);
check("production output at component cost", Number(fg.quantity) === 2 && Number(fg.amount) > 0, "2 qty, positive value", `${fg.quantity}/${fg.amount}`, "production");

const posting = await one(`SELECT id FROM stock_postings WHERE idempotency_key='dispatch-1'`);
await db.exec(`SELECT reverse_stock_posting('${posting.id}','cancel','2026-05-06','rev-1')`);
const reversed = await one(`SELECT status FROM stock_postings WHERE id='${posting.id}'`);
check("reversal keeps history", reversed.status === "reversed", "reversed", reversed.status, "inventory");

await db.exec(`INSERT INTO purchase_bills(id,bill_number) VALUES ('00000000-0000-0000-0000-000000000051','PB1')`);
await db.exec(`INSERT INTO purchase_bill_items(purchase_bill_id,raw_material_id,quantity,unit_price) VALUES ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000021',4,18)`);
await db.exec(`SELECT receive_purchase_bill('00000000-0000-0000-0000-000000000051')`);
await db.exec(`SELECT receive_purchase_bill('00000000-0000-0000-0000-000000000051')`);
const pb = await one(`SELECT count(*)::int AS n FROM stock_postings WHERE idempotency_key LIKE 'purchase:00000000-0000-0000-0000-000000000051%'`);
check("purchase receipt posts once", pb.n === 1, "1", pb.n, "purchases");

await db.exec(`INSERT INTO ledger_accounts(id,name) VALUES ('00000000-0000-0000-0000-000000000061','Inventory'),('00000000-0000-0000-0000-000000000062','Creditors')`);
await db.exec(`SELECT post_balanced_voucher('purchase','PB-GL-1','2026-05-07','00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000062',100,'purchase_bills','00000000-0000-0000-0000-000000000051','purchase')`);
await db.exec(`SELECT post_balanced_voucher('purchase','PB-GL-1B','2026-05-07','00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000062',100,'purchase_bills','00000000-0000-0000-0000-000000000051','purchase')`);
const gl = await one(`SELECT count(*)::int AS n, sum(debit) AS debit, sum(credit) AS credit FROM voucher_entries`);
check("GL voucher balanced and idempotent", gl.n === 2 && Number(gl.debit) === Number(gl.credit), "debit=credit, one voucher", `${gl.n}/${gl.debit}/${gl.credit}`, "accounting");

await db.exec(`INSERT INTO invoices(id,subtotal,tax_amount,dispatch_state_code,supplier_gstin) VALUES ('00000000-0000-0000-0000-000000000071',1000,180,'32','29AAAAA0000A1Z1')`);
await db.exec(`SELECT snapshot_invoice_tax('00000000-0000-0000-0000-000000000071')`);
const tax = await one(`SELECT igst,cgst,sgst FROM invoice_tax_snapshots`);
check("GST interstate snapshot", Number(tax.igst) === 180 && Number(tax.cgst) === 0, "igst 180", `${tax.igst}/${tax.cgst}/${tax.sgst}`, "gst");

await db.exec(`INSERT INTO financial_years(id,name,start_date,end_date) VALUES ('00000000-0000-0000-0000-000000000081','FY26','2026-04-01','2027-03-31')`);
await db.exec(`INSERT INTO ledger_accounts(id,name) VALUES ('00000000-0000-0000-0000-000000000063','P&L'),('00000000-0000-0000-0000-000000000064','Retained')`);
await db.exec(`SELECT post_balanced_voucher('journal','INC-1','2026-05-08','00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000063',40,'manual','00000000-0000-0000-0000-000000000091','income')`);
await db.exec(`SELECT close_financial_year('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000064','00000000-0000-0000-0000-000000000063')`);
const locked = await one(`SELECT is_locked FROM financial_years WHERE id='00000000-0000-0000-0000-000000000081'`);
check("FY close locks year", locked.is_locked === true, "locked", locked.is_locked, "accounting");

const first = await one(`SELECT ingest_tally_event('tally:v:1','voucher','1') AS ok`);
const second = await one(`SELECT ingest_tally_event('tally:v:1','voucher','1') AS ok`);
check("Tally ingest rejects duplicate", first.ok === true && second.ok === false, "true then false", `${first.ok}/${second.ok}`, "tally");

const historical = await one(`SELECT count(*)::int AS n FROM stock_movements WHERE narration='historical opening'`);
check("historical movement not rewritten", historical.n === 1, "1", historical.n, "inventory");

results.push({ name: "concurrent sessions", status: "PARTIAL", expected: "two sessions race one balance", actual: "PGlite is single-connection; row locks not concurrency-tested", module: "inventory" });
results.push({ name: "bank reconciliation", status: "PARTIAL", expected: "statement lines match cash book", actual: "existing screen left unchanged; no new matcher validated", module: "banking" });
results.push({ name: "cost-centre split", status: "PARTIAL", expected: "line allocations equal parent", actual: "voucher_entries.cost_center_id exists; split allocator not added", module: "accounting" });

let pass = 0, fail = 0, partial = 0;
for (const row of results) {
  if (row.status === "PASS") pass++; else if (row.status === "FAIL") fail++; else partial++;
  console.log(`${row.status} | ${row.name} | expected ${row.expected} | actual ${row.actual} | ${row.module}`);
}
console.log(`SUMMARY ${pass} PASS, ${fail} FAIL, ${partial} PARTIAL`);
if (fail) process.exit(1);
