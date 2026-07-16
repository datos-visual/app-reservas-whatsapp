-- Seed B2: convierte la TIENDA DEMO en peluquería (doc 08 §4.1).
-- Idempotente: solo inserta servicios que no existan ya (por nombre).
-- Para tiendas nuevas, el onboarding copiará esta semilla automáticamente
-- (definida también en backend/src/verticals.js).

update public.stores set vertical_code = 'peluqueria'
where id = '0aa6d8d7-7be8-4292-8a6b-cac0a0c917da';

insert into public.services (store_id, name, duration_minutes, price_eur, description, sort_order)
select '0aa6d8d7-7be8-4292-8a6b-cac0a0c917da', s.name, s.dur, s.precio, s.descr, s.orden
from (values
  ('Corte',                30,  15.00, 'Corte de pelo — 30 min',              1),
  ('Corte + lavado',       45,  19.00, 'Con lavado y secado — 45 min',        2),
  ('Tinte',               120,  45.00, 'Coloración completa — 2 h',           3),
  ('Mechas',              150,  60.00, 'Mechas o balayage — 2 h 30',          4),
  ('Peinado evento',       45,  25.00, 'Recogidos y eventos — 45 min',        5),
  ('Barba',                15,   8.00, 'Arreglo de barba — 15 min',           6),
  ('Tratamiento keratina', 90,  50.00, 'Alisado y keratina — 1 h 30',         7)
) as s(name, dur, precio, descr, orden)
where not exists (
  select 1 from public.services x
  where x.store_id = '0aa6d8d7-7be8-4292-8a6b-cac0a0c917da' and x.name = s.name
);

-- VERIFICACIÓN (7 filas):
-- select name, duration_minutes, price_eur from services
-- where store_id = '0aa6d8d7-7be8-4292-8a6b-cac0a0c917da' order by sort_order;
