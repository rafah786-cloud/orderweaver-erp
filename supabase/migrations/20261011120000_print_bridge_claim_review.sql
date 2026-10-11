-- Safe, explicitly reviewed reprints for claimed/ambiguous Windows spool jobs.
-- This never re-queues output automatically; an operator must force review after
-- inspecting the Windows queue and physical printer output.

CREATE OR REPLACE FUNCTION public.retry_production_print_job(
  p_job_id uuid,
  p_force_review boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_job public.production_print_jobs%ROWTYPE;
  v_new_job uuid;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL
    OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'production')) THEN
    RAISE EXCEPTION 'Production print access required';
  END IF;

  SELECT j.* INTO v_job
  FROM public.production_print_jobs j
  WHERE j.id = p_job_id AND j.company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Print job not found'; END IF;

  IF v_job.status IN ('needs_review', 'claimed', 'spooled') AND NOT p_force_review THEN
    RAISE EXCEPTION 'Job requires an explicit duplicate-output inspection before reprinting';
  END IF;

  IF v_job.status NOT IN ('failed', 'needs_review', 'claimed', 'spooled') THEN
    RAISE EXCEPTION 'Only failed or explicitly inspected jobs can be reprinted';
  END IF;

  -- Preserve the original job for audit. A claimed job is ambiguous (the agent
  -- may have sent paper output before a network failure), so record operator review.
  IF v_job.status = 'claimed' THEN
    UPDATE public.production_print_jobs
    SET status = 'needs_review', completed_at = now(), updated_at = now(),
        last_error = 'Operator selected manual reprint while the job was claimed; physical output must be inspected.'
    WHERE id = v_job.id AND company_id = v_company;
  END IF;

  INSERT INTO public.production_print_jobs (
    company_id, job_type, sales_order_id, parent_job_id, idempotency_key, payload
  )
  VALUES (
    v_company, 'sales_order_receipt_reprint', v_job.sales_order_id, v_job.id,
    'manual-reprint:' || v_job.id::text || ':' || replace(gen_random_uuid()::text, '-', ''),
    v_job.payload
  )
  RETURNING id INTO v_new_job;

  RETURN v_new_job;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_production_print_job(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_production_print_job(uuid,boolean) TO authenticated;
