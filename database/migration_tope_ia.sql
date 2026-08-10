-- =====================================================================
-- TOPE DIARIO DE IA POR TIENDA
-- Fecha: 2026-08-10
--
-- Las claves de Gemini y Mistral son UNAS para todas las tiendas. Sin
-- techo, una peluquería con una clienta insistente —o un bucle raro— se
-- come la cuota (o la factura) de las demás. Y como la IA aquí solo
-- INTERPRETA, quedarse sin ella no rompe nada: se cae al flujo de
-- botones, que funciona igual de bien y más rápido.
--
-- Dos piezas:
--
-- 1) nlu_usage — un contador por tienda y día. Nada de guardar el texto:
--    solo cuántas veces se llamó al modelo. Lo que no se guarda no se
--    filtra.
--
-- 2) incrementar_uso_nlu() — suma y devuelve el total EN UNA operación.
--    Leer-y-luego-escribir desde el backend perdería cuentas cuando dos
--    mensajes entran a la vez, que es justo cuando importa.
--
-- El límite: stores.nlu_max_dia por tienda; si está a NULL manda la
-- variable de entorno NLU_MAX_DIA del backend.
--
-- Idempotente: se puede ejecutar varias veces sin efecto secundario.
-- =====================================================================

create table if not exists public.nlu_usage (
  store_id  uuid   not null references public.stores (id) on delete cascade,
  dia       date   not null,
  llamadas  integer not null default 0,
  primary key (store_id, dia)
);

comment on table public.nlu_usage is
  'Llamadas al modelo de lenguaje por tienda y día. Solo el recuento, nunca el contenido.';

alter table public.nlu_usage enable row level security;

alter table public.stores
  add column if not exists nlu_max_dia integer;

comment on column public.stores.nlu_max_dia is
  'Tope diario de llamadas a la IA para esta tienda. NULL = se usa el valor por defecto del backend (NLU_MAX_DIA).';

-- Suma 1 y devuelve el total del día. Atómico: el upsert resuelve la
-- carrera entre dos mensajes simultáneos sin bloqueos explícitos.
create or replace function public.incrementar_uso_nlu(p_store_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  insert into public.nlu_usage (store_id, dia, llamadas)
  values (p_store_id, current_date, 1)
  on conflict (store_id, dia)
  do update set llamadas = public.nlu_usage.llamadas + 1
  returning llamadas into total;
  return total;
end;
$$;

-- Limpieza: 90 días de historial bastan para ver tendencias
create index if not exists nlu_usage_dia_idx on public.nlu_usage (dia desc);

-- Comprobación
select
  (select count(*) from public.nlu_usage)                                   as filas,
  (select count(*) from information_schema.columns
     where table_name = 'stores' and column_name = 'nlu_max_dia')           as columna_tope,
  (select count(*) from information_schema.routines
     where routine_name = 'incrementar_uso_nlu')                            as funcion;
