-- Restrictive company boundaries for business records without a direct company_id.
BEGIN;

DROP POLICY IF EXISTS "company_scope_bank_transactions" ON public.bank_transactions;
CREATE POLICY "company_scope_bank_transactions"
  ON public.bank_transactions AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bank_accounts b
    WHERE b.id = bank_transactions.bank_account_id
      AND b.company_id = public.current_company_id()
      AND public.has_company_access(b.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bank_accounts b
    WHERE b.id = bank_transactions.bank_account_id
      AND b.company_id = public.current_company_id()
      AND public.has_company_access(b.company_id)
  ));

DROP POLICY IF EXISTS "company_scope_e_invoices" ON public.e_invoices;
CREATE POLICY "company_scope_e_invoices"
  ON public.e_invoices AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = e_invoices.invoice_id
      AND i.company_id = public.current_company_id()
      AND public.has_company_access(i.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = e_invoices.invoice_id
      AND i.company_id = public.current_company_id()
      AND public.has_company_access(i.company_id)
  ));

DROP POLICY IF EXISTS "company_scope_e_way_bills" ON public.e_way_bills;
CREATE POLICY "company_scope_e_way_bills"
  ON public.e_way_bills AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = e_way_bills.invoice_id
      AND i.company_id = public.current_company_id()
      AND public.has_company_access(i.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = e_way_bills.invoice_id
      AND i.company_id = public.current_company_id()
      AND public.has_company_access(i.company_id)
  ));

DROP POLICY IF EXISTS "company_scope_party_ledger_entries" ON public.party_ledger_entries;
CREATE POLICY "company_scope_party_ledger_entries"
  ON public.party_ledger_entries AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parties p
    WHERE p.id = party_ledger_entries.party_id
      AND p.company_id = public.current_company_id()
      AND public.has_company_access(p.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.parties p
    WHERE p.id = party_ledger_entries.party_id
      AND p.company_id = public.current_company_id()
      AND public.has_company_access(p.company_id)
  ));

DROP POLICY IF EXISTS "company_scope_supplier_ledger_entries" ON public.supplier_ledger_entries;
CREATE POLICY "company_scope_supplier_ledger_entries"
  ON public.supplier_ledger_entries AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = supplier_ledger_entries.supplier_id
      AND s.company_id = public.current_company_id()
      AND public.has_company_access(s.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = supplier_ledger_entries.supplier_id
      AND s.company_id = public.current_company_id()
      AND public.has_company_access(s.company_id)
  ));

DROP POLICY IF EXISTS "company_scope_stock_batches" ON public.stock_batches;
CREATE POLICY "company_scope_stock_batches"
  ON public.stock_batches AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_items si
      WHERE si.id = stock_batches.stock_item_id
        AND si.company_id = public.current_company_id()
        AND public.has_company_access(si.company_id)
    )
    AND (
      stock_batches.godown_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.godowns g
        WHERE g.id = stock_batches.godown_id
          AND g.company_id = public.current_company_id()
          AND public.has_company_access(g.company_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stock_items si
      WHERE si.id = stock_batches.stock_item_id
        AND si.company_id = public.current_company_id()
        AND public.has_company_access(si.company_id)
    )
    AND (
      stock_batches.godown_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.godowns g
        WHERE g.id = stock_batches.godown_id
          AND g.company_id = public.current_company_id()
          AND public.has_company_access(g.company_id)
      )
    )
  );

DROP POLICY IF EXISTS "company_scope_stock_journal_entries" ON public.stock_journal_entries;
CREATE POLICY "company_scope_stock_journal_entries"
  ON public.stock_journal_entries AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_items si
      WHERE si.id = stock_journal_entries.stock_item_id
        AND si.company_id = public.current_company_id()
        AND public.has_company_access(si.company_id)
    )
    AND (
      stock_journal_entries.from_godown_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.godowns g
        WHERE g.id = stock_journal_entries.from_godown_id
          AND g.company_id = public.current_company_id()
          AND public.has_company_access(g.company_id)
      )
    )
    AND (
      stock_journal_entries.to_godown_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.godowns g
        WHERE g.id = stock_journal_entries.to_godown_id
          AND g.company_id = public.current_company_id()
          AND public.has_company_access(g.company_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stock_items si
      WHERE si.id = stock_journal_entries.stock_item_id
        AND si.company_id = public.current_company_id()
        AND public.has_company_access(si.company_id)
    )
    AND (
      stock_journal_entries.from_godown_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.godowns g
        WHERE g.id = stock_journal_entries.from_godown_id
          AND g.company_id = public.current_company_id()
          AND public.has_company_access(g.company_id)
      )
    )
    AND (
      stock_journal_entries.to_godown_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.godowns g
        WHERE g.id = stock_journal_entries.to_godown_id
          AND g.company_id = public.current_company_id()
          AND public.has_company_access(g.company_id)
      )
    )
  );

DROP POLICY IF EXISTS "company_scope_stock_valuation_settings" ON public.stock_valuation_settings;
CREATE POLICY "company_scope_stock_valuation_settings"
  ON public.stock_valuation_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id = public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "company_scope_gst_returns" ON public.gst_returns;
CREATE POLICY "company_scope_gst_returns"
  ON public.gst_returns AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = public.current_company_id()
      AND c.is_active
      AND c.gstin IS NOT NULL
      AND c.gstin = gst_returns.gstin
      AND public.has_company_access(c.id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = public.current_company_id()
      AND c.is_active
      AND c.gstin IS NOT NULL
      AND c.gstin = gst_returns.gstin
      AND public.has_company_access(c.id)
  ));

COMMIT;
