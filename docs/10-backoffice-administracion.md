# 10 — Backoffice de administración (A1)

> **Estado:** v1 construida (17-jul-2026). Herramienta interna del fundador
> para operar todas las tiendas: salud, incidencias y activación de servicios
> premium. Evoluciona por fases según crezca el número de tiendas.

## 1. Qué es y qué NO es

- **Es** el panel del ADMINISTRADOR del SaaS (el fundador): ve TODAS las
  tiendas. Es la única pieza del sistema que se salta el aislamiento por
  `store_id`, de forma consciente y solo tras `ADMIN_TOKEN`.
- **No es** el panel del dueño del negocio (ese ya existe y solo ve SU tienda).

## 2. v1 construida

### Backend (`backend/src/admin.js` + rutas en `index.js`)
- `GET /api/admin/overview` — todas las tiendas con: conexión WhatsApp
  (+caducidad de token), conexión Calendar, estado de módulos (missed-call,
  recordatorios) y sus plantillas, flags premium, nº de citas ±7 días, y
  **incidencias derivadas** (calculadas de los datos, no registradas a mano):
  WhatsApp sin conectar/inactivo, token caducado o a <7 días, Calendar sin
  conectar, módulo activo con plantilla sin aprobar. La previsión operativa
  es esto: ver el problema antes de que la tienda llame.
- `PUT /api/admin/stores/:storeId/features` — activa/desactiva flags premium
  con whitelist estricta (`smart_slots`, `waitlist`, `reactivation`,
  `post_sale`, `style_file`, `flash_offers`).
- Ambas rutas exigen `req.isAdmin` (ADMIN_TOKEN); un JWT de tienda recibe 403.
- Lecturas tolerantes: una tabla/columna sin migrar no tumba el overview.

### Frontend (`frontend/app/admin/page.tsx`)
- Ruta `/admin` del panel. El ADMIN_TOKEN se teclea a mano y vive SOLO en
  `sessionStorage` del navegador — **nunca** en `NEXT_PUBLIC_*` ni en el build
  (lección de seguridad del paso 4).
- Tarjetas por tienda: chips de salud, incidencias en rojo/ámbar, y
  **interruptores de los 6 flags premium** con guardado inmediato.

## 3. Flujo comercial previsto (automatización por fases)

**Hoy (Fase 1, manual consciente):** cliente contrata plan → el admin marca
los flags de ese plan en `/admin` (20 segundos). Con <20 tiendas es suficiente
y permite regalar flags sueltos a pilotos.

**Fase B (con Stripe):** tabla `plans` (nombre, precio, flags incluidos) +
webhook de Stripe (`checkout.session.completed`, `customer.subscription.
updated/deleted`) → aplicar/retirar los flags del plan automáticamente y
registrar el evento. El backoffice pasa a ser supervisión y excepción manual
(el requisito del fundador: "el sistema genera los servicios solo, y yo veo
conflictos y activo a mano si hace falta"). El PUT de flags ya es la pieza
que el webhook reutilizará.

**Autoservicio de la tienda (con B6, decidido 17-jul):** dos niveles de
control — **contratado** (flags del plan: admin hoy, Stripe mañana; solo el
admin los toca) y **activado** (de lo contratado, qué usa la tienda:
interruptores en el panel del negocio). Implementación prevista: columna
`stores.features_disabled` (jsonb) que el dueño gestiona; un módulo corre si
`contratado && !desactivado`. La tienda nunca puede autoactivarse lo que no
paga. Sobre incentivos por elegir huecos ⭐ (P1): NO en v1 — la marca
"Recomendado" ya empuja sin comerse margen; medir adopción primero y, solo si
hiciera falta, descuento opcional configurable POR la tienda.

**Fase C (según volumen):** tabla `store_incidents` persistente (además de
las derivadas) con estado abierta/resuelta; alertas por email al admin
(token caduca, webhook fallando N veces, tienda sin actividad 14 días);
vista de una tienda con últimos mensajes/citas (impersonación de SOLO
lectura); métricas agregadas del negocio (MRR por plan, tiendas activas).

## 4. Seguridad

1. ADMIN_TOKEN solo se teclea a mano; rotarlo si se sospecha exposición
   (pendiente arrastrado: rotar el actual, salió en capturas).
2. Las rutas admin comprueban `isAdmin` explícitamente — un JWT válido de
   tienda NUNCA pasa.
3. El overview no devuelve tokens ni secretos (solo `phone_number_id` y
   fechas de caducidad).
4. Cuando haya más de un administrador: sustituir el token único por roles
   en Supabase Auth (no antes; YAGNI).
