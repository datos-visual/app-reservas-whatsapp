-- Migración: configuración por tienda y horarios de negocio
-- Ejecutar en Supabase SQL Editor. Safe: IF NOT EXISTS.

-- 1) Añadir columnas a stores
alter table public.stores
  add column if not exists timezone text default 'Europe/Madrid',
  add column if not exists appointment_duration_minutes smallint default 30;

-- 2) Tabla store_business_hours
create table if not exists public.store_business_hours (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  weekday smallint not null check (weekday >= 0 and weekday <= 6),
  open_time time,
  close_time time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists store_business_hours_store_weekday_unique
  on public.store_business_hours (store_id, weekday);

alter table public.store_business_hours enable row level security;

-- 3) Seed: L-D 08:00-17:00 para tiendas existentes (weekday 0=domingo, 1=lunes, ..., 6=sábado)
-- Compatibilidad con tienda demo actual.
insert into public.store_business_hours (store_id, weekday, open_time, close_time, is_closed)
select s.id, gs, '08:00'::time, '17:00'::time, false
from public.stores s
cross join generate_series(0, 6) gs
where not exists (
  select 1 from public.store_business_hours sbh
  where sbh.store_id = s.id and sbh.weekday = gs
);
