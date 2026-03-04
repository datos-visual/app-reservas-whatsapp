-- Customers: clientes identificados por número de teléfono
create table if not exists public.customers (
  id bigint generated always as identity primary key,
  phone text not null unique,
  name text,
  notes text,
  created_at timestamptz not null default now()
);

-- Messages: log de mensajes entrantes y salientes
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  phone text not null,
  content text not null,
  from_me boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_from_me_idx on public.messages (from_me, created_at desc);

-- Appointments: citas asociadas a un cliente y a un evento de Google Calendar
create table if not exists public.appointments (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  google_event_id text,
  status text not null default 'confirmed',
  source text not null default 'whatsapp',
  created_at timestamptz not null default now()
);

create index if not exists appointments_start_at_idx on public.appointments (start_at);
create index if not exists appointments_customer_idx on public.appointments (customer_id, start_at);

create unique index if not exists appointments_start_at_unique on public.appointments (start_at);

-- Recomendado: políticas RLS (para MVP puedes desactivarlas o dar acceso al servicio)
alter table public.customers enable row level security;
alter table public.messages enable row level security;
alter table public.appointments enable row level security;

-- Para acceso solo desde la clave SERVICE_ROLE del backend, puedes crear políticas amplias:
-- (En Supabase UI puedes afinarlas más adelante.)

