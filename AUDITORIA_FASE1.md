# Auditoría Fase 1 - Producción

## Resumen ejecutivo

Auditoría completada para el SaaS multi-tienda de reservas por WhatsApp. Se han aplicado correcciones para cumplir con los requisitos de producción (Render stateless, idempotencia, persistencia de estado, dashboard funcional).

---

## Lista priorizada de issues

### BLOQUEANTES (resueltos)

| # | Issue | Estado |
|---|-------|--------|
| 1 | **Estado pendiente en memoria** (`pendingAppointments` Map) incompatible con Render stateless | ✅ Resuelto: tabla `conversation_state` en DB |
| 2 | **Dashboard sin store_id**: APIs `/api/appointments` y `/api/messages` requieren `store_id` pero el frontend no lo enviaba | ✅ Resuelto: input Store ID + persistencia en localStorage |
| 3 | **Migración conversation_state** inexistente | ✅ Resuelto: `migration_production_phase1.sql` |

### RECOMENDADOS (resueltos)

| # | Issue | Estado |
|---|-------|--------|
| 4 | **META_APP_SECRET** no documentado como alias de firma webhook | ✅ Resuelto: config.js acepta META_APP_SECRET |
| 5 | **Health con test DB** opcional | ✅ Resuelto: `/health?db=1` |
| 6 | **Unique index messages** con NULL: índice parcial más explícito | ✅ Resuelto: `WHERE message_id IS NOT NULL` |

### PENDIENTES (no bloqueantes)

| # | Issue | Acción |
|---|-------|--------|
| 7 | Fecha "hoy" en API appointments: usa servidor, no timezone tienda | Considerar `TZ` o `date` explícito desde frontend |
| 8 | Limpieza periódica de `conversation_state` expirados | Cron job o trigger en Supabase |

---

## Mapa del proyecto

```
app-whatsapp/
├── backend/
│   ├── src/
│   │   ├── index.js      # Express, webhook, rutas API
│   │   ├── config.js     # Variables de entorno
│   │   ├── db.js         # Supabase, conversation_state
│   │   ├── calendar.js   # Google Calendar por store_id
│   │   └── whatsappCloud.js  # Cloud API, firma, extract
│   └── package.json
├── frontend/
│   └── app/
│       ├── page.tsx      # Dashboard (store_id + admin token)
│       └── layout.tsx
├── database/
│   ├── schema.sql
│   ├── migration_idempotencia_messages.sql
│   └── migration_production_phase1.sql  # NUEVO
└── README.md
```

---

## Verificaciones realizadas

### 1. Webhook

- ✅ GET `/webhook`: devuelve `hub.challenge` si `verify_token` coincide
- ✅ POST `/webhook`: valida `X-Hub-Signature-256` con HMAC-SHA256(app_secret, raw_body)
- ✅ Responde 200 rápido, procesa en `setImmediate`
- ✅ Extrae `metadata.phone_number_id`, `message.id`, `from`, `text.body`
- ✅ Resuelve `store_id` vía `whatsapp_accounts(phone_number_id)`
- ✅ Idempotencia: `logInboundMessageOnce` con unique (store_id, message_id)

### 2. DB

- ✅ Todas las consultas filtran por `store_id`
- ✅ No hay `service_role` en frontend
- ✅ Migración con `conversation_state` y unique parcial en messages

### 3. Calendar

- ✅ `calendar_connections.google_calendar_id` por `store_id`
- ✅ `events.insert` con `dateTime` RFC3339 + `timeZone`
- ✅ `google_event_id` guardado en `appointments`

### 4. Conversación

- ✅ Comandos: DISPONIBLE YYYY-MM-DD, CITA YYYY-MM-DD HH:MM, SI/NO
- ✅ Estado pendiente persistido en `conversation_state` con `expires_at`
- ✅ Revalidación con `events.list` antes de crear evento en confirmación SI

### 5. Render

- ✅ `listen(process.env.PORT || 4000)`
- ✅ `/health` devuelve 200; `/health?db=1` prueba DB

---

## Variables de entorno (documentadas)

| Variable | Uso |
|----------|-----|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role (solo backend) |
| `GOOGLE_CLIENT_EMAIL` | Email de la Service Account |
| `GOOGLE_PRIVATE_KEY` | Clave privada (escapar `\n`) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Token para GET /webhook |
| `META_APP_SECRET` | Secreto para X-Hub-Signature-256 (o WHATSAPP_APP_SECRET) |
| `ADMIN_TOKEN` | Token para rutas /api/* |
| `DASHBOARD_ORIGIN` | Origen CORS (ej. https://tu-dashboard.onrender.com) |
| `TZ` | Zona horaria (ej. Europe/Madrid) |
| `PORT` | Puerto HTTP (Render lo inyecta) |

---

## Checklist de pruebas

### Local

- [ ] `cd backend && npm install && npm run dev`
- [ ] `curl http://localhost:4000/health` → 200
- [ ] `curl "http://localhost:4000/health?db=1"` → 200 si DB OK
- [ ] `curl "http://localhost:4000/webhook?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=123"` → 123

### Webhook POST (simulación)

```bash
# Con META_APP_SECRET configurado
# Generar firma: echo -n 'PAYLOAD_JSON' | openssl dgst -sha256 -hmac "SECRET" -binary | xxd -p -c 256
# curl -X POST http://localhost:4000/webhook \
#   -H "Content-Type: application/json" \
#   -H "X-Hub-Signature-256: sha256=FIRMA_HEX" \
#   -d 'PAYLOAD_JSON'
```

### End-to-end

- [ ] Enviar mensaje real a WhatsApp Business
- [ ] DISPONIBLE 2026-03-10 → slots
- [ ] CITA 2026-03-10 09:00 → confirmación
- [ ] SI → cita creada, evento en Google Calendar, registros en DB

### Render

- [ ] Deploy backend
- [ ] Configurar todas las env vars
- [ ] Health check en URL pública
- [ ] Webhook Meta apuntando a `https://tu-api.onrender.com/webhook`
