-- Índice único parcial: evita dos citas confirmadas en la misma hora por tienda.
-- Solo aplica cuando status = 'confirmed'.
-- Opcional: si tienes appointments_store_start_at_unique (full), elimínalo para usar el parcial.
drop index if exists public.appointments_store_start_at_unique;

create unique index if not exists appointments_store_start_at_confirmed_unique
  on public.appointments (store_id, start_at)
  where status = 'confirmed';
