\set ON_ERROR_STOP on

-- Fixtures use only synthetic identities and the two companies seeded by the authoritative migrations.
INSERT INTO auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','ws0-admin-a@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','ws0-requester-a@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','ws0-approver-a@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
 ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','ws0-admin-b@example.test','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles(id,full_name,email,status,active_company_id)
SELECT v.id,v.full_name,v.email,'approved'::public.user_status,c.id
FROM (VALUES
 ('10000000-0000-4000-8000-000000000001'::uuid,'WS0 Admin A','ws0-admin-a@example.test','ABOOD'),
 ('10000000-0000-4000-8000-000000000002'::uuid,'WS0 Requester A','ws0-requester-a@example.test','ABOOD'),
 ('10000000-0000-4000-8000-000000000003'::uuid,'WS0 Approver A','ws0-approver-a@example.test','ABOOD'),
 ('10000000-0000-4000-8000-000000000004'::uuid,'WS0 Admin B','ws0-admin-b@example.test','ZIZZ')
) AS v(id,full_name,email,company_code)
JOIN public.companies c ON c.code=v.company_code
ON CONFLICT (id) DO UPDATE SET full_name=excluded.full_name,email=excluded.email,
  status='approved'::public.user_status,active_company_id=excluded.active_company_id;

INSERT INTO public.user_company_access(user_id,company_id,is_default,can_view,can_create,can_edit,can_delete)
SELECT v.user_id,c.id,v.is_default,true,true,true,false
FROM (VALUES
 ('10000000-0000-4000-8000-000000000001'::uuid,'ABOOD',true),
 ('10000000-0000-4000-8000-000000000002'::uuid,'ABOOD',true),
 ('10000000-0000-4000-8000-000000000003'::uuid,'ABOOD',true),
 ('10000000-0000-4000-8000-000000000004'::uuid,'ZIZZ',false)
) AS v(user_id,company_code,is_default)
JOIN public.companies c ON c.code=v.company_code
ON CONFLICT (user_id,company_id) DO UPDATE SET can_view=true,can_create=true,can_edit=true;

INSERT INTO public.user_roles(user_id,role)
VALUES
 ('10000000-0000-4000-8000-000000000001','admin'::public.app_role),
 ('10000000-0000-4000-8000-000000000002','sales'::public.app_role),
 ('10000000-0000-4000-8000-000000000003','admin'::public.app_role),
 ('10000000-0000-4000-8000-000000000004','admin'::public.app_role)
ON CONFLICT (user_id,role) DO NOTHING;

CREATE TEMP TABLE ws0_test_ids (
  company_a uuid NOT NULL,
  company_b uuid NOT NULL,
  requester_request uuid,
  self_request uuid,
  company_b_request uuid
) ON COMMIT PRESERVE ROWS;
GRANT ALL ON TABLE ws0_test_ids TO authenticated;
INSERT INTO ws0_test_ids(company_a,company_b)
SELECT a.id,b.id FROM public.companies a CROSS JOIN public.companies b
WHERE a.code='ABOOD' AND b.code='ZIZZ';

BEGIN;
SET LOCAL ROLE authenticated;

DO $tests$
DECLARE
  v_company_a uuid;
  v_company_b uuid;
  v_request uuid;
  v_self_request uuid;
  v_company_b_request uuid;
  v_count bigint;
  v_before bigint;
  v_after bigint;
  v_status text;
  v_a uuid := '10000000-0000-4000-8000-000000000001';
  v_requester uuid := '10000000-0000-4000-8000-000000000002';
  v_approver uuid := '10000000-0000-4000-8000-000000000003';
  v_admin_b uuid := '10000000-0000-4000-8000-000000000004';
BEGIN
  SELECT company_a,company_b INTO STRICT v_company_a,v_company_b FROM ws0_test_ids;

  PERFORM set_config('request.jwt.claim.sub',v_a::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_a::text,'role','authenticated')::text,true);
  INSERT INTO public.approval_rules(company_id,action_key,entity_type,currency,min_amount,max_amount,
    approver_roles,required_approvals,priority,created_by)
  VALUES(v_company_a,'finance.payment.release','payment','INR',100,1000,ARRAY['admin'],1,100,v_a);

  PERFORM set_config('request.jwt.claim.sub',v_admin_b::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_admin_b::text,'role','authenticated')::text,true);
  INSERT INTO public.approval_rules(company_id,action_key,entity_type,currency,min_amount,max_amount,
    approver_roles,required_approvals,priority,created_by)
  VALUES(v_company_b,'finance.payment.release','payment','INR',100,1000,ARRAY['admin'],1,100,v_admin_b);

  -- Cross-company scope and RLS must fail closed.
  PERFORM set_config('request.jwt.claim.sub',v_a::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_a::text,'role','authenticated')::text,true);
  IF public.ws0_scope_allowed(v_company_b,NULL) THEN
    RAISE EXCEPTION 'TEST FAILURE: company B scope was allowed to company A user';
  END IF;
  SELECT count(*) INTO v_count FROM public.approval_rules WHERE company_id=v_company_b;
  IF v_count<>0 THEN RAISE EXCEPTION 'TEST FAILURE: RLS exposed company B approval rules'; END IF;

  -- Branch-scoped operations must deny until a real branch and active-branch binding are proven.
  IF public.ws0_scope_allowed(v_company_a,'f0000000-0000-4000-8000-000000000001'::uuid) THEN
    RAISE EXCEPTION 'TEST FAILURE: unverified branch scope was allowed';
  END IF;

  -- Matching threshold permits request; missing rule and out-of-range amount deny.
  PERFORM set_config('request.jwt.claim.sub',v_requester::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_requester::text,'role','authenticated')::text,true);
  v_request := public.ws0_submit_approval_request(v_company_a,NULL,'finance.payment.release','payment',
    'a0000000-0000-4000-8000-000000000001'::uuid,500,'INR',
    'reason includes fake password=not-a-real-secret and token=not-a-real-token','ws0-test-valid',now()+interval '1 day');
  IF v_request IS NULL THEN RAISE EXCEPTION 'TEST FAILURE: valid approval request was not created'; END IF;
  UPDATE ws0_test_ids SET requester_request=v_request;

  BEGIN
    PERFORM public.ws0_submit_approval_request(v_company_a,NULL,'finance.payment.release','payment',
      'a0000000-0000-4000-8000-000000000002'::uuid,1500,'INR','threshold probe',NULL,NULL);
    RAISE EXCEPTION 'TEST FAILURE: out-of-threshold request unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'No matching active approval rule%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.ws0_submit_approval_request(v_company_a,NULL,'finance.writeoff','writeoff',
      'a0000000-0000-4000-8000-000000000003'::uuid,500,'INR','missing rule probe',NULL,NULL);
    RAISE EXCEPTION 'TEST FAILURE: request without a rule unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'No matching active approval rule%' THEN RAISE; END IF;
  END;

  -- Requester cannot bypass the RPC through direct table writes.
  BEGIN
    INSERT INTO public.approval_requests(company_id,rule_id,action_key,entity_type,entity_id,requester_id,
      amount,currency,required_approvals)
    VALUES(v_company_a,'d0000000-0000-4000-8000-000000000001'::uuid,
      'finance.payment.release','payment','a0000000-0000-4000-8000-000000000004'::uuid,v_requester,500,'INR',1);
    RAISE EXCEPTION 'TEST FAILURE: direct approval request insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    RAISE;
  END;
  BEGIN
    UPDATE public.approval_requests SET status='approved' WHERE id=v_request;
    RAISE EXCEPTION 'TEST FAILURE: direct status update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    RAISE;
  END;
  BEGIN
    INSERT INTO public.approval_decisions(company_id,request_id,approver_id,decision)
    VALUES(v_company_a,v_request,v_requester,'approved');
    RAISE EXCEPTION 'TEST FAILURE: direct approval decision insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    RAISE;
  END;

  -- Authenticated clients cannot forge WS0 audit records directly.
  BEGIN
    INSERT INTO public.erp_domain_audit_log(company_id,module,entity_type,action,actor_id)
    VALUES(v_company_a,'ws0','forged_test_event','insert',v_requester);
    RAISE EXCEPTION 'TEST FAILURE: direct WS0 audit insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    RAISE;
  END;

  -- Self-approval is prohibited even for an admin.
  PERFORM set_config('request.jwt.claim.sub',v_a::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_a::text,'role','authenticated')::text,true);
  v_self_request := public.ws0_submit_approval_request(v_company_a,NULL,'finance.payment.release','payment',
    'a0000000-0000-4000-8000-000000000005'::uuid,500,'INR','self-approval probe',NULL,NULL);
  UPDATE ws0_test_ids SET self_request=v_self_request;
  BEGIN
    PERFORM public.ws0_decide_approval_request(v_self_request,'approved','self-approval must fail');
    RAISE EXCEPTION 'TEST FAILURE: self-approval unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Self-approval is prohibited%' THEN RAISE; END IF;
  END;

  -- Cross-company decision function must deny an otherwise eligible admin.
  PERFORM set_config('request.jwt.claim.sub',v_admin_b::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_admin_b::text,'role','authenticated')::text,true);
  v_company_b_request := public.ws0_submit_approval_request(v_company_b,NULL,'finance.payment.release','payment',
    'b0000000-0000-4000-8000-000000000001'::uuid,500,'INR','company B request',NULL,NULL);
  UPDATE ws0_test_ids SET company_b_request=v_company_b_request;
  PERFORM set_config('request.jwt.claim.sub',v_a::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_a::text,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.ws0_decide_approval_request(v_company_b_request,'approved','cross-company probe');
    RAISE EXCEPTION 'TEST FAILURE: cross-company approval unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Approval decision denied:%' THEN RAISE; END IF;
  END;

  -- A non-self approver with the configured role can approve the pending request.
  PERFORM set_config('request.jwt.claim.sub',v_approver::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_approver::text,'role','authenticated')::text,true);
  v_status := public.ws0_decide_approval_request(v_request,'approved','valid approval');
  IF v_status <> 'approved' THEN RAISE EXCEPTION 'TEST FAILURE: valid approval did not reach approved state'; END IF;

  -- Same winning specificity and priority with overlapping ranges is ambiguous and must deny.
  PERFORM set_config('request.jwt.claim.sub',v_a::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_a::text,'role','authenticated')::text,true);
  INSERT INTO public.approval_rules(company_id,action_key,entity_type,currency,min_amount,max_amount,
    approver_roles,required_approvals,priority,created_by)
  VALUES(v_company_a,'finance.payment.release','payment','INR',0,800,ARRAY['admin'],1,100,v_a);
  PERFORM set_config('request.jwt.claim.sub',v_requester::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_requester::text,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.ws0_submit_approval_request(v_company_a,NULL,'finance.payment.release','payment',
      'a0000000-0000-4000-8000-000000000006'::uuid,500,'INR','overlap probe',NULL,NULL);
    RAISE EXCEPTION 'TEST FAILURE: overlapping rules unexpectedly resolved';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Ambiguous approval rules%' THEN RAISE; END IF;
  END;

  -- Status-history writes participate in the caller's transaction and roll back atomically.
  SELECT count(*) INTO v_before FROM public.ws0_status_history;
  BEGIN
    PERFORM public.ws0_record_status_history(v_company_a,NULL,'test_entity',
      'c0000000-0000-4000-8000-000000000001'::uuid,'draft','submitted','atomicity probe',NULL,NULL);
    RAISE EXCEPTION 'ws0_test_force_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ws0_test_force_rollback' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO v_after FROM public.ws0_status_history;
  IF v_after<>v_before THEN RAISE EXCEPTION 'TEST FAILURE: status history survived transaction rollback'; END IF;
END
$tests$;

RESET ROLE;

-- Verify audit redaction and append-only protection as the migration/test owner.
DO $audit_tests$
DECLARE
  v_audit_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT id,before_data,after_data INTO v_audit_id,v_before,v_after
  FROM public.erp_domain_audit_log
  WHERE module='ws0' AND entity_type='approval_requests'
  ORDER BY created_at DESC LIMIT 1;
  IF v_audit_id IS NULL THEN RAISE EXCEPTION 'TEST FAILURE: WS0 approval audit row missing'; END IF;
  IF COALESCE(v_before,'{}'::jsonb) ?| ARRAY['reason','email','password','token','secret','raw_user_meta_data']
     OR COALESCE(v_after,'{}'::jsonb) ?| ARRAY['reason','email','password','token','secret','raw_user_meta_data'] THEN
    RAISE EXCEPTION 'TEST FAILURE: sensitive field present in audit snapshot';
  END IF;
  BEGIN
    UPDATE public.erp_domain_audit_log SET reason='tamper attempt' WHERE id=v_audit_id;
    RAISE EXCEPTION 'TEST FAILURE: WS0 audit update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'WS0 audit rows are append-only%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.erp_domain_audit_log WHERE id=v_audit_id;
    RAISE EXCEPTION 'TEST FAILURE: WS0 audit delete unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAILURE:%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'WS0 audit rows are append-only%' THEN RAISE; END IF;
  END;
END
$audit_tests$;

COMMIT;
