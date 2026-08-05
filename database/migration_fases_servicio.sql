-- =====================================================================
-- FASES DE UN SERVICIO: trabajo inicial · espera · trabajo final
-- Fecha: 2026-08-04
--
-- El caso real (peluquería): un tinte ocupa el puesto 90 minutos, pero la
-- peluquera solo trabaja 15 al principio (aplicar) y 30 al final (lavar,
-- secar, peinar). Los 45 del medio la clienta está sentada esperando y la
-- peluquera puede atender a otra persona.
--
-- Sin esto, un tinte bloquea 90 minutos de peluquera cuando en realidad la
-- ocupa 45: se pierden citas todos los días.
--
-- REGLA DE COMPATIBILIDAD: por defecto los tres valores son 0, que
-- significa "todo el servicio es trabajo activo" — exactamente el
-- comportamiento anterior. Las fases solo actúan cuando la tienda las
-- rellena Y gestiona su equipo.
--
-- Idempotente: se puede ejecutar varias veces sin efecto secundario.
-- =====================================================================

alter table public.services
  add column if not exists trabajo_inicial_min smallint not null default 0,
  add column if not exists espera_min          smallint not null default 0,
  add column if not exists trabajo_final_min   smallint not null default 0;

comment on column public.services.espera_min is
  'Minutos en los que la clienta ocupa el puesto pero la profesional queda libre. 0 = servicio de trabajo continuo.';

-- OJO: no hay columna de interruptor. Esta funcionalidad es PREMIUM y se
-- gobierna con el flag `fases_servicio` dentro de stores.premium_features
-- (lo contrata el admin desde el backoffice) menos stores.features_disabled
-- (lo apaga la tienda desde «Mi plan»). Un único interruptor, sin
-- contradicciones posibles.

-- Margen de seguridad al encajar una cita en el hueco de espera de otra:
-- el relleno debe terminar N minutos antes de que toque volver al tinte.
alter table public.stores
  add column if not exists margen_relleno_min smallint not null default 5;

comment on column public.stores.margen_relleno_min is
  'Colchón en minutos entre una cita encajada en un hueco de espera y la vuelta al trabajo de la cita principal.';

-- Comprobación: los tres tramos deben sumar la duración del servicio
select id, name, duration_minutes,
       trabajo_inicial_min, espera_min, trabajo_final_min,
       (trabajo_inicial_min + espera_min + trabajo_final_min) as suma,
       case
         when espera_min = 0 then 'trabajo continuo (como siempre)'
         when trabajo_inicial_min + espera_min + trabajo_final_min = duration_minutes then 'OK'
         else '⚠️ los tramos no suman la duración'
       end as estado
from public.services
order by store_id, sort_order;
