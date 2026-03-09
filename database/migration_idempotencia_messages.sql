-- Añadir columna para idempotencia de mensajes (wamid) e índices recomendados.

alter table public.messages
  add column if not exists message_id text;

create unique index if not exists messages_store_message_id_unique
  on public.messages (store_id, message_id);

-- Índices adicionales por store_id (idempotencia y rendimiento)

create index if not exists customers_store_id_idx
  on public.customers (store_id);

create index if not exists appointments_store_id_idx
  on public.appointments (store_id);

