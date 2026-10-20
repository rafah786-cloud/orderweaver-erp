ALTER FUNCTION public.move_to_dlq(text,text,int8,jsonb) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text,int4,int4) SET search_path = '';
ALTER FUNCTION public.enqueue_email(text,jsonb) SET search_path = '';
ALTER FUNCTION public.delete_email(text,int8) SET search_path = '';