BEGIN;

INSERT INTO public.user_company_access(user_id, company_id, is_default)
SELECT p.id, c.id, (c.code = 'ABOOD')
FROM public.profiles p
CROSS JOIN public.companies c
WHERE c.code IN ('ABOOD', 'ZIZZ')
ON CONFLICT (user_id, company_id) DO UPDATE
SET is_default = CASE WHEN EXCLUDED.is_default THEN true ELSE public.user_company_access.is_default END;

COMMIT;
