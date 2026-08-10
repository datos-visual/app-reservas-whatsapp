-- =====================================================================
-- INTERRUPTOR MANUAL DE LA IA POR TIENDA
-- Fecha: 2026-08-10
--
-- El tope diario (migration_tope_ia.sql) apaga la IA cuando una tienda se
-- pasa de llamadas. Esto es lo otro: apagarla A MANO, cuando queramos,
-- sin esperar a ningún contador.
--
-- Para qué sirve de verdad:
--   · Una tienda que no la necesita (todas sus clientas usan los botones).
--   · Un proveedor caído o carísimo: se apaga y se sigue trabajando.
--   · Diagnosticar: si algo raro pasa, apagarla aísla el problema en un clic.
--
-- Apagarla NO degrada el servicio: el flujo de botones sigue igual, y es más
-- rápido y gratis. La IA solo INTERPRETA texto libre; nunca decide nada.
--
-- Vive en `stores` y no en `premium_features` a propósito: no es una función
-- que se venda, es un mando de operación nuestro.
--
-- Idempotente: se puede ejecutar varias veces sin efecto secundario.
-- =====================================================================

alter table public.stores
  add column if not exists nlu_activo boolean not null default true;

comment on column public.stores.nlu_activo is
  'false = esta tienda no usa la IA para interpretar texto libre; el asistente funciona solo con botones.';

-- Comprobación
select
  count(*)                                   as tiendas,
  count(*) filter (where nlu_activo)         as con_ia,
  count(*) filter (where not nlu_activo)     as sin_ia
from public.stores;
