-- Close cross-company HR visibility through direct table access.
BEGIN;

DROP POLICY IF EXISTS "pay read" ON public.payslips;
CREATE POLICY "pay read active company"
  ON public.payslips FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payslips.employee_id
        AND e.company_id = public.current_company_id()
        AND public.has_company_access(e.company_id)
    )
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'hr')
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = payslips.employee_id AND e.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "pay write admin/hr" ON public.payslips;
CREATE POLICY "pay write admin/hr active company"
  ON public.payslips FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
  );

-- The active-company employee relationship remains the hard boundary for
-- attendance and punch-event reads.
DROP POLICY IF EXISTS "att read" ON public.attendance;
CREATE POLICY "att read active company"
  ON public.attendance FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'hr')
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance.employee_id AND e.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "punch read" ON public.punch_events;
CREATE POLICY "punch read active company"
  ON public.punch_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = punch_events.employee_id
        AND e.company_id = public.current_company_id()
        AND public.has_company_access(e.company_id)
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'hr')
          OR e.user_id = auth.uid()
        )
    )
  );

COMMIT;
