-- ============================================================
-- Migración: flags premium por tienda (doc 09, P1 smart_slots)
-- Idempotente: se puede ejecutar varias veces sin efecto.
-- El backend es tolerante a que esta migración NO esté aplicada
-- (getPremiumFeatures devuelve {} = todo apagado).
-- ============================================================

alter table stores
  add column if not exists premium_features jsonb not null default '{}'::jsonb;

comment on column stores.premium_features is
  'Flags de módulos premium (doc 09). OFF por defecto. Ej.: {"smart_slots": true}. La paquetización comercial = conjunto de flags.';

-- A2: la tienda puede APAGAR servicios de su plan desde su panel (doc 10 §3).
-- Efectivo = premium_features MENOS features_disabled. Nunca al revés:
-- la tienda no puede activarse nada que no esté en premium_features.
alter table stores
  add column if not exists features_disabled jsonb not null default '{}'::jsonb;

comment on column stores.features_disabled is
  'Servicios del plan que la tienda ha desactivado voluntariamente desde su panel. Ej.: {"waitlist": true}.';

-- Verificación:
--   select id, name, premium_features from stores;
--
-- Activar la compactación de agenda (P1) en la tienda demo:
--   update stores
--   set premium_features = premium_features || '{"smart_slots": true}'::jsonb
--   where id = '0aa6d8d7-7be8-4292-8a6b-cac0a0c917da';
--
-- Desactivar:
--   update stores
--   set premium_features = premium_features - 'smart_slots'
--   where id = '0aa6d8d7-7be8-4292-8a6b-cac0a0c917da';
