-- Migración: customers multi-tenant (store_id, phone)
-- Corrige unicidad global por phone que impide el mismo cliente en varias tiendas.
-- Ejecutar en Supabase SQL Editor.

-- 1) Eliminar constraint/índice de unicidad global por phone (si existe)
alter table public.customers drop constraint if exists customers_phone_key;
drop index if exists public.customers_phone_key;

-- 2) Asegurar unicidad por (store_id, phone)
create unique index if not exists customers_store_phone_unique
  on public.customers (store_id, phone);
