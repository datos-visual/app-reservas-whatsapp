-- =====================================================================
-- SINCRONIZACIÓN CON GOOGLE CALENDAR (borrados hechos fuera de la app)
-- Fecha: 2026-08-04
--
-- Qué resuelve: si la tienda borra un evento directamente en su Google
-- Calendar, la cita seguía "confirmed" en la base de datos y el hueco
-- quedaba bloqueado para siempre. Ahora el sistema lo detecta y libera
-- la hora.
--
-- Este interruptor permite que la tienda apague esa vigilancia y todo
-- vuelva a comportarse EXACTAMENTE como antes.
--
-- Idempotente: se puede ejecutar varias veces sin efecto secundario.
-- =====================================================================

alter table public.stores
  add column if not exists usar_sync_calendar boolean not null default true;

comment on column public.stores.usar_sync_calendar is
  'Si es true (por defecto), las citas cuyo evento se borre en Google Calendar se cancelan automáticamente y el hueco vuelve a ofrecerse.';

-- Comprobación
select id, name, usar_sync_calendar
from public.stores
order by created_at;
