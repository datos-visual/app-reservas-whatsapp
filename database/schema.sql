-- Esquema base (multi-tenant SaaS) para el bot de reservas por WhatsApp Cloud API.
-- Nota: este fichero está pensado como referencia/arranque. En tu Supabase real puedes tener
-- campos extra. La API backend asume que existen estas tablas y columnas clave.

-- Stores: tenant / tienda
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz not null default now()
);

-- WhatsApp accounts (por tienda): mapeo phone_number_id → store_id + credenciales Cloud API
create table if not exists public.whatsapp_accounts (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  phone_number_id text not null,
  phone_number text,
  access_token text not null,
  verify_token text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_accounts_phone_number_id_unique
  on public.whatsapp_accounts (phone_number_id);

create index if not exists whatsapp_accounts_store_id_idx
  on public.whatsapp_accounts (store_id);

-- Calendar connections (por tienda): calendar id de Google Calendar
create table if not exists public.calendar_connections (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  google_calendar_id text not null,
  mode text not null default 'service_account',
  created_at timestamptz not null default now()
);

create unique index if not exists calendar_connections_store_id_unique
  on public.calendar_connections (store_id);

-- Customers: clientes identificados por tienda y teléfono
create table if not exists public.customers (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  phone text not null,
  name text,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists customers_store_phone_unique
  on public.customers (store_id, phone);

-- Messages: log de mensajes entrantes y salientes (multi-tenant)
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  phone text not null,
  content text not null,
  from_me boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_store_created_at_idx
  on public.messages (store_id, created_at desc);
create index if not exists messages_store_from_me_idx
  on public.messages (store_id, from_me, created_at desc);

-- Appointments: citas por tienda, únicas por (store_id, start_at)
create table if not exists public.appointments (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  customer_id bigint not null references public.customers (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  google_event_id text,
  status text not null default 'confirmed',
  source text not null default 'whatsapp_cloud',
  created_at timestamptz not null default now()
);

create index if not exists appointments_store_start_at_idx
  on public.appointments (store_id, start_at);
create index if not exists appointments_store_customer_idx
  on public.appointments (store_id, customer_id, start_at);

create unique index if not exists appointments_store_start_at_unique
  on public.appointments (store_id, start_at);

-- Recomendado: políticas RLS (para MVP puedes desactivarlas o dar acceso al servicio)
alter table public.stores enable row level security;
alter table public.whatsapp_accounts enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.customers enable row level security;
alter table public.messages enable row level security;
alter table public.appointments enable row level security;

