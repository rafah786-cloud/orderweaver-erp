ALTER TABLE public.notification_log ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notification_log_idem_sent_uidx
  ON public.notification_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status = 'sent';
CREATE INDEX IF NOT EXISTS notification_log_idem_idx
  ON public.notification_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;