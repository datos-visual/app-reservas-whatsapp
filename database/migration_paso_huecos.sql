-- =====================================================================
-- REJILLA DE HUECOS: cada cuántos minutos puede EMPEZAR una cita
-- Fecha: 2026-08-04
--
-- Qué resuelve: hasta ahora los huecos se generaban en bloques del tamaño
-- del servicio. Un sábado de 10:00 a 14:00 con un servicio de 2h30 solo
-- ofrecía las 10:00 (el siguiente bloque, 12:30, ya no cabía), cuando
-- 11:30→14:00 estaba perfectamente libre. Dinero perdido cada día.
--
-- Con paso = 30 se ofrecen 10:00, 10:30, 11:00 y 11:30.
--
-- Valores admitidos: 15, 30 (por defecto), 60, o 0 = bloques del tamaño
-- del servicio (comportamiento anterior, por si alguna tienda lo prefiere).
--
-- Idempotente: se puede ejecutar varias veces sin efecto secundario.
-- =====================================================================

alter table public.stores
  add column if not exists paso_huecos_min smallint not null default 30;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stores_paso_huecos_min_check'
  ) then
    alter table public.stores
      add constraint stores_paso_huecos_min_check
      check (paso_huecos_min in (0, 15, 30, 60));
  end if;
end $$;

comment on column public.stores.paso_huecos_min is
  'Cada cuántos minutos puede empezar una cita. 0 = bloques del tamaño del servicio (comportamiento anterior a ago-2026).';

-- Comprobación
select id, name, paso_huecos_min
from public.stores
order by created_at;
