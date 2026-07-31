-- ============================================================
-- Migración N8: origen del nombre del cliente. Idempotente.
-- 'perfil_whatsapp' = lo tomamos del perfil de WhatsApp (propuesto,
--                     el cliente puede corregirlo)
-- 'cliente'         = lo dijo el propio cliente por WhatsApp
-- 'negocio'         = lo escribió la tienda desde el panel (futuro)
-- El backend es tolerante: sin esta columna todo sigue funcionando.
-- ============================================================

alter table public.customers
  add column if not exists name_source text;

comment on column public.customers.name_source is
  'Origen del nombre: perfil_whatsapp | cliente | negocio. Sirve para saber si el nombre está confirmado por la persona.';

-- Verificación:
--   select phone, name, name_source from customers order by created_at desc limit 10;
