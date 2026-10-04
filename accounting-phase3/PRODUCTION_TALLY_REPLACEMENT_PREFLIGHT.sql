-- Mattress Maestro / Tally replacement production preflight
-- READ ONLY. This file intentionally contains no INSERT/UPDATE/DELETE/DDL.
-- Run against the LIVE database only from an authenticated, privileged SQL session.
-- A complete PASS is required before installing accounting/inventory posting functions.

-- 1. Voucher control totals and historical integrity
SELECT
  count(*) AS voucher_count,
  coalesce(sum(total_debit),0) AS total_debit,
  coalesce(sum(total_credit),0) AS total_credit
FROM (
  SELECT v.id,
         coalesce(sum(e.debit),0) AS total_debit,
         coalesce(sum(e.credit),0) AS total_credit
  FROM public.vouchers v
  LEFT JOIN public.voucher_entries e ON e.voucher_id = v.id
  GROUP BY v.id
) x;

SELECT v.id, v.voucher_number, v.voucher_type, v.voucher_date
FROM public.vouchers v
WHERE EXISTS (
  SELECT 1 FROM public.voucher_entries e
  WHERE e.voucher_id = v.id
)
GROUP BY v.id, v.voucher_number, v.voucher_type, v.voucher_date
HAVING round(coalesce(sum((SELECT sum(e2.debit) FROM public.voucher_entries e2 WHERE e2.voucher_id=v.id)),0),2)
    <> round(coalesce(sum((SELECT sum(e3.credit) FROM public.voucher_entries e3 WHERE e3.voucher_id=v.id)),0),2)
ORDER BY v.voucher_date, v.voucher_number;

-- 2. Duplicate voucher numbers
SELECT voucher_number, count(*) AS occurrences
FROM public.vouchers
GROUP BY voucher_number
HAVING count(*) > 1
ORDER BY occurrences DESC, voucher_number;

-- 3. Financial-year overlap / historical vouchers without FY metadata
SELECT a.id AS year_a, a.name AS year_a_name, b.id AS year_b, b.name AS year_b_name
FROM public.financial_years a
JOIN public.financial_years b ON a.id < b.id
 AND a.start_date <= b.end_date
 AND b.start_date <= a.end_date;

SELECT v.id, v.voucher_number, v.voucher_date
FROM public.vouchers v
WHERE NOT EXISTS (
  SELECT 1 FROM public.financial_years fy
  WHERE v.voucher_date BETWEEN fy.start_date AND fy.end_date
)
ORDER BY v.voucher_date, v.voucher_number;

-- 4. Bill-wise controls
SELECT
  count(*) AS bill_count,
  count(*) FILTER (WHERE party_id IS NULL) AS bills_without_party,
  count(*) FILTER (WHERE original_amount IS NULL OR original_amount <= 0) AS invalid_amounts
FROM public.bills;

SELECT
  count(*) AS allocation_count,
  coalesce(sum(amount),0) AS allocated_total
FROM public.bill_allocations;

SELECT b.id, b.party_id, b.original_amount,
       coalesce(sum(a.amount),0) AS allocated_amount
FROM public.bills b
LEFT JOIN public.bill_allocations a ON a.bill_id = b.id
GROUP BY b.id, b.party_id, b.original_amount
HAVING coalesce(sum(a.amount),0) > b.original_amount
ORDER BY b.id;

-- 5. Legacy outstanding duplication check
SELECT
  coalesce(sum(p.current_balance),0) AS party_current_balance_total,
  count(*) FILTER (WHERE p.current_balance <> 0) AS nonzero_party_balances,
  coalesce(sum(p.opening_balance),0) AS party_opening_balance_total
FROM public.parties p;

SELECT
  coalesce(sum(i.total_amount),0) AS invoice_total,
  coalesce(sum(i.paid_amount),0) AS invoice_paid,
  coalesce(sum(i.total_amount - coalesce(i.paid_amount,0)),0) AS invoice_outstanding
FROM public.invoices i;

-- 6. Party-ledger mapping coverage
SELECT
  count(*) AS party_count,
  count(*) FILTER (WHERE la.id IS NOT NULL) AS mapped_ledger_count,
  count(*) FILTER (WHERE p.current_balance <> 0 AND la.id IS NULL) AS nonzero_without_ledger
FROM public.parties p
LEFT JOIN public.ledger_accounts la ON la.mapped_party_id = p.id;

-- 7. Supplier-ledger mapping coverage
SELECT
  count(*) AS supplier_count,
  count(*) FILTER (WHERE la.id IS NOT NULL) AS mapped_ledger_count,
  count(*) FILTER (WHERE s.current_balance <> 0 AND la.id IS NULL) AS nonzero_without_ledger
FROM public.suppliers s
LEFT JOIN public.ledger_accounts la ON la.mapped_supplier_id = s.id;

-- 8. Required system ledgers
SELECT n.name,
       EXISTS (SELECT 1 FROM public.ledger_accounts la WHERE lower(la.name)=lower(n.name) AND coalesce(la.is_active,true)) AS active
FROM (VALUES ('Cash'),('Sales'),('Purchases'),('Output CGST'),('Output SGST'),('Output IGST'),('Input CGST'),('Input SGST'),('Input IGST')) n(name);

-- 9. Inventory quantity/value consistency
SELECT
  count(*) AS raw_material_count,
  coalesce(sum(current_stock),0) AS current_stock_quantity,
  count(*) FILTER (WHERE current_stock <> 0) AS nonzero_materials
FROM public.raw_materials;

SELECT
  count(*) AS movement_count,
  coalesce(sum(quantity),0) AS movement_quantity,
  coalesce(sum(amount),0) AS movement_value,
  count(*) FILTER (WHERE coalesce(rate,0) = 0 AND quantity <> 0) AS unrated_quantity_rows
FROM public.stock_movements;

-- 10. Opening movements with no defensible valuation
SELECT sm.id, sm.stock_item_id, sm.quantity, sm.rate, sm.amount
FROM public.stock_movements sm
WHERE sm.movement_type ILIKE '%opening%'
  AND sm.quantity <> 0
  AND coalesce(sm.rate,0) = 0
ORDER BY sm.id;

-- 11. Production/BOM coverage
SELECT
  count(*) AS boq_rows,
  count(*) FILTER (WHERE quantity_per_unit IS NULL OR quantity_per_unit <= 0) AS invalid_boq_rows
FROM public.model_boq;

-- 12. Direct-write / privilege inspection (read only)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('vouchers','voucher_entries','voucher_number_series','bills','bill_allocations','stock_movements')
ORDER BY grantee, table_name, privilege_type;

-- CUTOVER RULE:
-- Do not install the prepared posting functions unless:
-- * voucher debits equal credits and there are no duplicate voucher numbers;
-- * every historical voucher date maps to exactly one financial year;
-- * bill allocations do not over-allocate and legacy outstanding duplication is reconciled;
-- * non-zero party/supplier balances have an accounting treatment and mapped ledger;
-- * required system ledgers are confirmed present/active;
-- * inventory quantity/value is reconciled and unrated opening quantity is explicitly accepted as quantity-only;
-- * production/BOM rows used by live orders have valid quantities;
-- * direct table grants are restricted so application users cannot bypass posting functions;
-- * a verified recovery point exists outside the live database.
