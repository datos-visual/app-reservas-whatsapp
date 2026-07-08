-- Migración Paso 5 (onboarding): datos de negocio en stores.
-- Idempotente. El estado del onboarding (draft/ready...) NO se guarda:
-- se deriva de calendar_connections y whatsapp_accounts (decisión del PDF).

alter table public.stores
  add column if not exists business_email text,
  add column if not exists business_phone text;

-- VERIFICACIÓN:
-- select column_name from information_schema.columns
-- where table_name='stores' and column_name like 'business%';
