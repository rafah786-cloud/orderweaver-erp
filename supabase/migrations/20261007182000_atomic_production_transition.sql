-- Atomic production workflow.
-- Stock consumption/output/dispatch and production status change must commit or
-- roll back together; separate browser RPCs could otherwise leave partial state.

CREATE OR REPLACE FUNCTION public.advance_production_order_atomic(
  p_order uuid,
  p_status text,
  p_tracking_number text DEFAULT NULL,
  p_transporter_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  company uuid:=public.current_company_id();
  po public.production_orders%ROWTYPE;
  next_status text;
BEGIN
  IF company IS NULL THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'production')
  ) THEN
    RAISE EXCEPTION 'Production access required';
  END IF;

  SELECT * INTO po
  FROM public.production_orders
  WHERE id=p_order AND company_id=company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found in active company';
  END IF;

  next_status:=CASE po.status::text
    WHEN 'received' THEN 'in_production'
    WHEN 'in_production' THEN 'qc'
    WHEN 'qc' THEN 'ready'
    WHEN 'ready' THEN 'dispatched'
    ELSE NULL
  END;

  IF next_status IS NULL OR p_status<>next_status THEN
    RAISE EXCEPTION 'Invalid production status transition from % to %',po.status,p_status;
  END IF;

  IF p_status='in_production' AND po.sales_order_id IS NOT NULL THEN
    PERFORM public.produce_sales_order_bom(
      po.sales_order_id,
      NULL,
      'bom:'||po.id::text
    );
  ELSIF p_status='ready' AND po.sales_order_id IS NOT NULL THEN
    PERFORM public.receive_sales_order_finished_goods(
      po.sales_order_id,
      NULL,
      'fg:'||po.id::text
    );
  ELSIF p_status='dispatched' AND po.sales_order_id IS NOT NULL THEN
    PERFORM public.dispatch_sales_order(
      po.sales_order_id,
      NULL,
      'dispatch:'||po.id::text
    );
  END IF;

  UPDATE public.production_orders
  SET
    status=p_status::public.production_status,
    started_at=CASE WHEN p_status='in_production' THEN now() ELSE started_at END,
    qc_at=CASE WHEN p_status='qc' THEN now() ELSE qc_at END,
    ready_at=CASE WHEN p_status='ready' THEN now() ELSE ready_at END,
    dispatched_at=CASE WHEN p_status='dispatched' THEN now() ELSE dispatched_at END,
    tracking_number=CASE
      WHEN p_status IN ('ready','dispatched') THEN NULLIF(btrim(p_tracking_number),'')
      ELSE tracking_number
    END,
    transporter_name=CASE
      WHEN p_status IN ('ready','dispatched') THEN NULLIF(btrim(p_transporter_name),'')
      ELSE transporter_name
    END,
    updated_at=now()
  WHERE id=po.id AND company_id=company;

  RETURN po.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_production_order_atomic(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_production_order_atomic(uuid,text,text,text) TO authenticated;
