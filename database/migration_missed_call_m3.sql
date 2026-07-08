-- Migración M3 (módulo missed-call): ampliar skip_reason con los estados
-- del motor de envío. Idempotente en la práctica: el DROP usa IF EXISTS y
-- el ADD falla solo si ya existe con el mismo nombre (ejecutar una vez).
--
--   send_failed → la Cloud API rechazó el envío de la plantilla (definitivo,
--                 normalmente plantilla mal configurada o token inválido)
--   expired     → llamada pendiente >48 h sin poder despacharse

alter table public.missed_calls
  drop constraint if exists missed_calls_skip_reason_check;

alter table public.missed_calls
  add constraint missed_calls_skip_reason_check
  check (skip_reason is null or skip_reason in
    ('quota_exceeded', 'optout', 'anonymous', 'disabled',
     'template_not_approved', 'dedupe_24h', 'no_whatsapp_account',
     'send_failed', 'expired'));

-- VERIFICACIÓN:
-- select pg_get_constraintdef(oid) from pg_constraint
-- where conname = 'missed_calls_skip_reason_check';
