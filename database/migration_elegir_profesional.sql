-- =====================================================================
-- B5.3 — ELEGIR PROFESIONAL (funcionalidad PREMIUM «elegir_profesional»)
-- Fecha: 2026-08-05
--
-- La clienta puede pedir cita con quien quiera. Suena sencillo y no lo es:
-- en cuanto alguien ELIGE persona, esa preferencia hay que respetarla, y el
-- sistema tiene que saber qué hacer cuando esa persona ya no puede atender.
--
-- Tres columnas, cada una con su porqué:
--
-- 1) appointments.resource_pedido
--    Distingue «se lo asignamos nosotros» de «la clienta pidió a Marta».
--    Sin esto no se puede decidir nada: al reasignar en bloque estaríamos
--    pisando preferencias sin saberlo.
--
-- 2) appointments.aviso_profesional_at
--    Marca cuándo se avisó a la clienta de que su profesional no puede.
--    El barrido corre cada 10 minutos: sin esta marca, la pobre recibiría
--    el mismo WhatsApp seis veces por hora.
--
-- 3) resources.elegible
--    La dueña atiende pero no quiere salir en la lista; alguien está en
--    formación. Sigue trabajando y contando para la capacidad, pero no
--    aparece cuando la clienta elige.
--
-- Idempotente: se puede ejecutar varias veces sin efecto secundario.
-- =====================================================================

alter table public.appointments
  add column if not exists resource_pedido boolean not null default false;

comment on column public.appointments.resource_pedido is
  'true = la clienta pidió expresamente a esa profesional. Si deja de poder atender, se le pregunta a ella en vez de reasignar en silencio.';

alter table public.appointments
  add column if not exists aviso_profesional_at timestamptz;

comment on column public.appointments.aviso_profesional_at is
  'Cuándo se avisó a la clienta de que su profesional no puede atenderla. Evita repetir el aviso en cada pasada del cron.';

alter table public.resources
  add column if not exists elegible boolean not null default true;

comment on column public.resources.elegible is
  'Si es false, esta persona no aparece en la lista que ve la clienta al elegir profesional (pero sigue trabajando y contando para la capacidad).';

-- Comprobación
select
  (select count(*) from information_schema.columns
     where table_name = 'appointments' and column_name = 'resource_pedido')      as pedido,
  (select count(*) from information_schema.columns
     where table_name = 'appointments' and column_name = 'aviso_profesional_at') as aviso,
  (select count(*) from information_schema.columns
     where table_name = 'resources' and column_name = 'elegible')                as elegible;
