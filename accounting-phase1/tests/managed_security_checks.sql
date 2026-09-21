-- Execute after authentication users/roles are installed in the isolated managed project.
-- anon cannot read accounting controls or execute posting functions.
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.create_gl_voucher('journal',current_date,'[]'::jsonb,NULL,NULL,'anon-denied','posted'); RAISE EXCEPTION 'anon unexpectedly posted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Accounting access required%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
-- authenticated direct writes are revoked; calls must use controlled RPCs.
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN INSERT INTO public.vouchers(voucher_number,voucher_type,voucher_date) VALUES('ILLEGAL','journal',current_date); RAISE EXCEPTION 'direct voucher write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.voucher_number_series SET next_number=next_number+1; RAISE EXCEPTION 'direct numbering write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
