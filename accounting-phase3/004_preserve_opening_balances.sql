-- DO NOT APPLY AUTOMATICALLY.
-- This file is intentionally outside supabase/migrations.
-- It preserves live balances and stock. It does not reset voucher series
-- and it does not change raw_materials.current_stock.

BEGIN;

CREATE TABLE IF NOT EXISTS public.accounting_opening_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_key text NOT NULL,
  entity_kind text NOT NULL,
  entity_id uuid,
  amount numeric(18,4) NOT NULL DEFAULT 0,
  quantity numeric(18,4),
  source_table text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_key, entity_kind, entity_id)
);

INSERT INTO public.accounting_opening_snapshot (snapshot_key, entity_kind, entity_id, amount, source_table)
SELECT 'preflight-2026-10-03', 'customer', id, current_balance, 'parties'
FROM public.parties
WHERE current_balance <> 0
ON CONFLICT (snapshot_key, entity_kind, entity_id) DO NOTHING;

INSERT INTO public.accounting_opening_snapshot (snapshot_key, entity_kind, entity_id, amount, source_table)
SELECT 'preflight-2026-10-03', 'supplier', id, current_balance, 'suppliers'
FROM public.suppliers
WHERE current_balance <> 0
ON CONFLICT (snapshot_key, entity_kind, entity_id) DO NOTHING;

INSERT INTO public.accounting_opening_snapshot (snapshot_key, entity_kind, entity_id, quantity, amount, source_table)
SELECT 'preflight-2026-10-03', 'raw_material', id, current_stock, 0, 'raw_materials'
FROM public.raw_materials
WHERE current_stock <> 0
ON CONFLICT (snapshot_key, entity_kind, entity_id) DO NOTHING;

INSERT INTO public.accounting_opening_snapshot (snapshot_key, entity_kind, entity_id, amount, source_table)
SELECT 'preflight-2026-10-03', 'invoice', id, total_amount - paid_amount, 'invoices'
FROM public.invoices
WHERE total_amount - paid_amount <> 0
ON CONFLICT (snapshot_key, entity_kind, entity_id) DO NOTHING;

-- Raise a series only if an existing voucher number is already at or beyond it.
-- Never lower SAL/8 or any other series.
UPDATE public.voucher_number_series s
SET next_number = GREATEST(s.next_number, n.max_number + 1)
FROM (
  SELECT voucher_type, MAX((regexp_match(voucher_number, '([0-9]+)$'))[1]::int) AS max_number
  FROM public.vouchers
  WHERE voucher_number ~ '[0-9]+$'
  GROUP BY voucher_type
) n
WHERE s.voucher_type = n.voucher_type
  AND n.max_number IS NOT NULL
  AND s.next_number < n.max_number + 1;

-- Opening stock ledger rows. current_stock is not updated.
INSERT INTO public.stock_movements (movement_date, stock_item_id, godown_id, movement_type, quantity, rate, amount, narration)
SELECT DATE '2025-04-01', si.id, g.id, 'opening', rm.current_stock, 0, 0, 'Opening preservation from current_stock'
FROM public.raw_materials rm
JOIN public.stock_items si ON si.mapped_raw_material_id = rm.id
JOIN public.godowns g ON g.code = 'MAIN'
WHERE rm.current_stock <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.stock_item_id = si.id AND sm.movement_type = 'opening'
  );

-- Opening customer bills only when the canonical bill table has the expected columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bills' AND column_name = 'original_amount'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bills' AND column_name = 'party_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bills' AND column_name = 'external_ref'
  ) THEN
    INSERT INTO public.bills (party_kind, party_id, original_amount, external_ref)
    SELECT 'customer', p.id, p.current_balance, 'opening:' || p.id::text
    FROM public.parties p
    WHERE p.current_balance <> 0
      AND NOT EXISTS (
        SELECT 1 FROM public.bills b
        WHERE b.external_ref = 'opening:' || p.id::text
      );
  END IF;
END $$;

COMMIT;
