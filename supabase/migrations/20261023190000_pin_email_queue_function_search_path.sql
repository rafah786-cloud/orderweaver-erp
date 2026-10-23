-- Pin the search path for the four SECURITY DEFINER email queue RPCs.
-- Their bodies qualify pgmq objects explicitly; an empty search_path avoids
-- resolution through caller-controlled schemas during privileged execution.
-- This migration is intentionally source-controlled only; do not apply it to
-- a hosted database until the repository/project linkage has been verified.

ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = '';
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = '';
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = '';
