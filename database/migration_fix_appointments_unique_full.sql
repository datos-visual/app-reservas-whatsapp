-- Migración correctiva: eliminar el UNIQUE FULL duplicado en appointments.
--
-- PROBLEMA (detectado en verificación del Supabase real, 2026-07):
--   Conviven dos restricciones de unicidad sobre (store_id, start_at):
--     1. appointments_store_start_at_confirmed_unique  → parcial, WHERE status='confirmed' (CORRECTA)
--     2. appointments_unique_store_start               → CONSTRAINT FULL, sin filtro (SOBRA)
--   La migración antigua intentaba borrar "appointments_store_start_at_unique",
--   pero en producción el constraint se llama distinto, así que nunca se eliminó.
--
-- EFECTO DEL BUG: si una cita se cancela (status='cancelled'), nadie puede volver
--   a reservar ese mismo hueco en esa tienda: el constraint FULL lanza 23505 y el
--   bot responde "ese hueco acaba de reservarse" para siempre.
--
-- SEGURIDAD: solo elimina la restricción redundante; la protección anti
--   doble-reserva real (índice parcial) se mantiene y se garantiza al final.
--   Idempotente: se puede ejecutar varias veces sin efecto adicional.

-- 1) Eliminar el constraint FULL (y su índice asociado)
alter table public.appointments
  drop constraint if exists appointments_unique_store_start;

-- 2) Por si en algún entorno existiera como índice suelto con ese nombre
drop index if exists public.appointments_unique_store_start;

-- 3) Garantizar que el índice parcial correcto existe (no hace nada si ya está)
create unique index if not exists appointments_store_start_at_confirmed_unique
  on public.appointments (store_id, start_at)
  where status = 'confirmed';

-- VERIFICACIÓN (ejecutar después; debe devolver SOLO el índice parcial):
-- select indexname from pg_indexes
-- where schemaname='public' and tablename='appointments' and indexdef like '%UNIQUE%'
--   and indexname like '%store_start%';
