-- Migración R1: recordatorios anti no-show (mejora nº1 del informe).
-- Idempotente. Ejecutar en Supabase SQL Editor.
--
-- Diseño: plantilla de utilidad 24 h y 2 h antes de la cita, con botones
-- [Confirmo] [Cancelar cita]. El despacho lo hace el cron existente
-- (/internal/missed-calls/dispatch) — sin infraestructura nueva.

-- 1) Tracking en appointments
alter table public.appointments
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_2h_sent_at timestamptz,
  add column if not exists confirmed_by_client_at timestamptz;

-- Índice de la cola de recordatorios (citas confirmadas futuras sin avisar)
create index if not exists appointments_reminders_due_idx
  on public.appointments (start_at)
  where status = 'confirmed'
    and (reminder_24h_sent_at is null or reminder_2h_sent_at is null);

-- 2) Configuración por tienda (mismo patrón que missed_call_settings)
create table if not exists public.reminder_settings (
  store_id           uuid primary key references public.stores (id) on delete cascade,
  enabled            boolean not null default false,
  remind_24h         boolean not null default true,
  remind_2h          boolean not null default true,
  template_name      text not null default 'canalagenda_reminder_v1',
  template_language  text not null default 'es',
  template_status    text not null default 'pending'
                       check (template_status in ('pending', 'approved', 'rejected')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.reminder_settings enable row level security;

-- VERIFICACIÓN:
-- select column_name from information_schema.columns
-- where table_name='appointments' and column_name like 'reminder%';
