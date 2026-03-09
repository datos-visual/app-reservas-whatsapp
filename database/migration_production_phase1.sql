-- Migración Fase 1 Producción: idempotencia + conversation_state
-- Ejecutar en Supabase SQL Editor. Safe: IF NOT EXISTS / IF EXISTS.

-- 1) Columna message_id para idempotencia (WAMID)
alter table public.messages
  add column if not exists message_id text;

-- 2) Unique parcial: solo cuando message_id no es null (evita duplicados por WAMID)
drop index if exists public.messages_store_message_id_unique;
create unique index if not exists messages_store_message_id_unique
  on public.messages (store_id, message_id)
  where message_id is not null;

-- 3) Tabla conversation_state: estado pendiente persistido (compatible Render stateless)
create table if not exists public.conversation_state (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  phone text not null,
  state jsonb not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists conversation_state_store_phone_unique
  on public.conversation_state (store_id, phone);

create index if not exists conversation_state_expires_at_idx
  on public.conversation_state (expires_at);

-- RLS (opcional, el backend usa service_role que bypass)
alter table public.conversation_state enable row level security;

-- 4) Índices adicionales por store_id (rendimiento)
create index if not exists customers_store_id_idx
  on public.customers (store_id);

create index if not exists appointments_store_id_idx
  on public.appointments (store_id);
