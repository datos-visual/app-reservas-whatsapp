# Auditoría proyecto-reservas – Fase 1 Producción

## Resumen ejecutivo

Auditoría completada para el SaaS multi-tienda de reservas por WhatsApp Cloud API. Cambios aplicados para cumplir los requisitos de producción (Render stateless, idempotencia, estado persistido, dashboard funcional).

---

## Lista de issues (bloqueantes / recomendados)

### BLOQUEANTES – Resueltos

| # | Issue | Riesgo | Estado |
|---|------|--------|--------|
| 1 | Estado pendiente en memoria (`pendingAppointments` Map) incompatible con Render stateless | Pérdida de estado en reinicios | ✅ Tabla `conversation_state` |
| 2 | Dashboard sin `store_id` en `/api/whatsapp/status` | API no devolvía datos por tienda | ✅ `store_id` en todas las llamadas |
| 3 | `/api/whatsapp/status` no aceptaba `store_id` ni devolvía `phone_number_id` | Dashboard genérico | ✅ Respuesta `{ ready, phone_number_id, configured }` |
| 4 | QR en frontend (no aplica en Cloud API) | Confusión de usuario | ✅ Eliminado, se muestra `phone_number_id` |

### RECOMENDADOS – Resueltos

| # | Issue | Riesgo | Estado |
|---|------|--------|--------|
| 5 | Graph API con versión fija `v18.0` | Deprecación futura | ✅ `META_GRAPH_API_VERSION` en config |
| 6 | Calendar: conversión a UTC en `createCalendarEvent` | Posible desfase horario | ✅ Uso de hora local con `timeZone` |
| 7 | Falta `getWhatsappAccountByStoreId` | No se podía consultar estado por tienda | ✅ Función añadida en `db.js` |

### PENDIENTES (no bloqueantes)

| # | Issue | Acción |
|---|-------|--------|
| 8 | `whatsappClient.js` deprecado con `pendingAppointments` | Mantener como referencia o eliminar |
| 9 | Limpieza de `conversation_state` expirados | Cron o trigger en Supabase |

---

## Diffs aplicados por archivo

### A) backend/src/config.js

- `metaAppSecret` y `metaGraphApiVersion` unificados
- `appSecret` con alias: `META_APP_SECRET`, `WHATSAPP_APP_SECRET`, `APP_SECRET`
- Indentación corregida

### B) backend/src/index.js

- `express.json({ verify })` para guardar `req.rawBody` (ya estaba)
- POST `/webhook`: validación de firma `x-hub-signature-256`, respuesta 200 rápida, procesamiento en `setImmediate` (ya estaba)
- Estado conversacional en DB: `getConversationState`, `setConversationState`, `deleteConversationState` (ya estaba)
- GET `/api/whatsapp/status`: acepta `store_id`, devuelve `{ ready, phone_number_id, configured }`

### C) backend/src/db.js

- `logInboundMessageOnce` con idempotencia por `(store_id, message_id)` (ya estaba)
- `getWhatsappAccountByStoreId` añadida
- Funciones `conversation_state` (ya estaban)

### D) backend/src/whatsappCloud.js

- URL de Graph API con `config.metaGraphApiVersion` (por defecto `v22.0`)
- `verifySignature` con HMAC SHA256 (ya estaba)

### E) backend/src/calendar.js

- `createCalendarEvent`: uso de hora local (`startDt.toISO()`) con `timeZone` en lugar de `toUTC()`
- `eventId` guardado en `appointments.google_event_id` (ya estaba)

### F) frontend/app/page.tsx

- Input Store ID con persistencia en `localStorage` (ya estaba)
- `store_id` en `/api/whatsapp/status`, `/api/appointments`, `/api/messages`
- Eliminado bloque de QR
- Tipo `WhatsappStatus`: `phone_number_id`, `configured`
- Se muestra `phone_number_id` cuando está configurado

---

## SQL migration

Ejecutar en Supabase SQL Editor:

```sql
-- 1) Idempotencia por WAMID
alter table public.messages add column if not exists message_id text;
drop index if exists public.messages_store_message_id_unique;
create unique index if not exists messages_store_message_id_unique
  on public.messages (store_id, message_id) where message_id is not null;

-- 2) Estado conversacional persistido
create table if not exists public.conversation_state (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  phone text not null,
  state jsonb not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists conversation_state_store_phone_unique
  on public.conversation_state (store_id, phone);
create index if not exists conversation_state_expires_at_idx
  on public.conversation_state (expires_at);
alter table public.conversation_state enable row level security;

-- 3) Índices adicionales
create index if not exists customers_store_id_idx on public.customers (store_id);
create index if not exists appointments_store_id_idx on public.appointments (store_id);
```

---

## Checklist Definition of Done

### Multi-tenant

- [x] `store_id` resuelto desde `metadata.phone_number_id` vía `whatsapp_accounts`
- [x] Todas las consultas filtran por `store_id`

### Webhook

- [x] GET `/webhook` devuelve `hub.challenge` si `verify_token` coincide
- [x] POST `/webhook` con `rawBody` y verificación `x-hub-signature-256` si hay App Secret
- [x] Respuesta 200 rápida, procesamiento en `setImmediate`

### Idempotencia

- [x] `unique(store_id, message_id)` en `messages`
- [x] `logInboundMessageOnce` detecta duplicados (23505) y no reprocesa

### Estado conversacional

- [x] Tabla `conversation_state` con `expires_at`
- [x] Flujo CITA → guardar en DB; SI/NO → leer y limpiar

### Calendar

- [x] `google_calendar_id` desde `calendar_connections` por `store_id`
- [x] `eventId` guardado en `appointments.google_event_id`
- [x] Hora local con `timeZone` (Europe/Madrid)

### Render

- [x] `listen(process.env.PORT || 4000)`
- [x] `/health` devuelve 200; `/health?db=1` prueba DB

### Seguridad

- [x] `SUPABASE_SERVICE_ROLE_KEY` solo en backend
- [x] `access_token` tratado como secreto (no expuesto en frontend)

### Dashboard

- [x] Input Store ID + token admin
- [x] `store_id` en todas las llamadas API
- [x] Sin QR; se muestra `phone_number_id`

---

## Variables de entorno (Render)

| Variable | Uso |
|----------|-----|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role (solo backend) |
| `GOOGLE_CLIENT_EMAIL` | Email de la Service Account |
| `GOOGLE_PRIVATE_KEY` | Clave privada (escapar `\n`) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Token para GET /webhook |
| `META_APP_SECRET` | Secreto para X-Hub-Signature-256 |
| `META_GRAPH_API_VERSION` | Versión Graph API (opcional, default v22.0) |
| `ADMIN_TOKEN` | Token para rutas /api/* |
| `DASHBOARD_ORIGIN` | Origen CORS |
| `TZ` | Zona horaria (ej. Europe/Madrid) |
| `PORT` | Inyectado por Render |

---

## Pruebas

### Local

```bash
cd backend && npm install && npm run dev
curl http://localhost:4000/health
curl "http://localhost:4000/webhook?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=123"
```

### WhatsApp

1. Enviar mensaje real al número de negocio
2. Revisar logs: `phone_number_id` → `store_id`, mensaje insertado con `message_id`
3. Flujo: DISPONIBLE → CITA → SI → evento en Google Calendar

### Google Calendar

- Verificar evento en el `calendarId` correcto
- Comprobar que la hora coincide con Europe/Madrid
