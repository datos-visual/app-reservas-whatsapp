-- Migración Paso 6: caducidad de tokens de WhatsApp (riesgo 11.1 del PDF).
-- Idempotente. NULL = token permanente (sin caducidad conocida).

alter table public.whatsapp_accounts
  add column if not exists token_expires_at timestamptz;

-- VERIFICACIÓN:
-- select column_name from information_schema.columns
-- where table_name='whatsapp_accounts' and column_name='token_expires_at';
