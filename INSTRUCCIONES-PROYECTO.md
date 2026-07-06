# INSTRUCCIONES DEL PROYECTO — CanalAgenda (SaaS reservas por WhatsApp)

> Pega este documento al inicio de cada sesión de trabajo con un asistente de IA
> (o inclúyelo como instrucciones del proyecto). Define las reglas fijas que
> NUNCA deben romperse y el contexto mínimo para trabajar.

---

## 1. Qué es el producto

SaaS multi-tienda (multi-tenant) para que comercios con cita previa gestionen
reservas por WhatsApp. Marca: **CanalAgenda**. El cliente final escribe por
WhatsApp, el bot consulta disponibilidad, confirma la cita, la guarda en
Supabase y crea el evento en el Google Calendar de esa tienda.

**Stack:** Next.js + Tailwind (frontend) · Express/Node (backend, Render,
STATELESS) · Supabase/Postgres (única fuente de verdad) · WhatsApp Cloud API
(Graph API) · Google Calendar vía service account compartida (JWT).

**Fase 1 = time-to-market:** procesos manuales/semimanuales aceptables.
NO entra: OAuth de Google, onboarding automático con Meta, Redis, colas,
facturación, analítica avanzada.

## 2. Estructura de carpetas

```
APP-RESERVAS-WHASTAPP/            (ojo al nombre: WHAS-TAPP)
├── GIT/app-whatsapp/             ← REPO PRINCIPAL (backend + dashboard)
│   ├── backend/src/              index.js, db.js, calendar.js,
│   │                             whatsappCloud.js, config.js
│   │                             (whatsappClient.js = DEPRECADO, no usar)
│   ├── database/                 schema.sql + migraciones .sql
│   ├── frontend/                 dashboard operativo (Next.js)
│   ├── docs/                     00..06 documentación viva
│   └── AUDITORIA_*.md            auditorías previas
├── GIT/frontend-app-whatsapp/    landing de marketing (sin backend real)
├── ARQUITECTURA/                 PDF de arquitectura Fase 1
└── JSON/                         ⚠ credenciales Google (NUNCA versionar)
```

## 3. REGLAS INVIOLABLES (multi-tenant y seguridad)

1. **Todo se resuelve por `store_id`.** Cadena sagrada:
   `webhook Meta → metadata.phone_number_id → whatsapp_accounts (is_active=true)
   → store_id → resto de tablas`.
2. **Toda query a Supabase filtra por `store_id`.** El backend usa
   SERVICE_ROLE_KEY (bypassa RLS), así que el filtro es responsabilidad del código.
3. **El `store_id` nunca lo aporta el usuario final** ni llega como parámetro
   libre desde el frontend (objetivo: derivarlo de la sesión autenticada).
4. **Backend stateless.** Nada en memoria ni en filesystem. Estado conversacional
   solo en la tabla `conversation_state`.
5. **El webhook devuelve 200 rápido** y procesa en background con `setImmediate`
   (sin colas en Fase 1).
6. **Idempotencia intocable:** índice único parcial `(store_id, message_id)`
   en messages + captura del error 23505.
7. **Anti doble-reserva intocable:** índice único parcial `(store_id, start_at)
   WHERE status='confirmed'` + ROLLBACK del evento de Google Calendar si salta 23505.
8. **Secretos solo en backend / variables de entorno.** Nunca en frontend,
   nunca en git, nunca en variables `NEXT_PUBLIC_*`.
9. **NO reintroducir whatsapp-web.js / QR.** Arquitectura descartada.
10. **NO ejecutar `schema.sql` a ciegas** para montar la BD: está desactualizado
    respecto a las migraciones. Verificar el Supabase real antes de tocar BD.

## 4. Estilo de código

- Mensajes, logs y documentación **en español**.
- Logs con prefijo de módulo: `[Webhook]`, `[DB]`, `[Calendar]`, `[WhatsAppCloud]`, `[API]`, `[Auth]`.
- Fechas/horas SIEMPRE con **luxon** y timezone de la tienda (`stores.timezone`).
  Prohibido `new Date().getHours()` para lógica de negocio.
- Manejo de errores con try/catch + log contextual (storeId, phone, etc.).
- Migraciones SQL **idempotentes** (`IF NOT EXISTS` / `IF EXISTS`), una por cambio.
- supabase-js con service role solo en backend.
- Normalizar tokens de WhatsApp: `replace(/\s+/g, '')`.

## 5. Cómo trabajar (proceso)

1. **Estudiar antes de tocar:** leer el código afectado y docs/ antes de proponer.
2. **Proponer plan y esperar OK** antes de cambios grandes o irreversibles
   (migraciones de BD, rotación de secretos, refactors).
3. **Incrementos pequeños y revisables.** No refactorizar de golpe lo que funciona.
4. Respetar las decisiones cerradas de Fase 1: service_role, sin Redis,
   stateless, service account compartida, onboarding semimanual.
5. No duplicar las auditorías existentes; partir de ellas.

## 6. Definition of Done (por cada cambio)

- [ ] Multi-tenant intacto: nada accede a datos de otra tienda.
- [ ] Webhook sigue devolviendo 200 rápido y procesando en background.
- [ ] Idempotencia y anti doble-reserva garantizadas.
- [ ] Secretos solo en backend/env, nunca en frontend ni git.
- [ ] Explicado QUÉ se cambió, POR QUÉ y CÓMO probarlo (local + Render/Supabase real).
- [ ] Incluido un paso de verificación (prueba manual o script) antes de cerrar.

## 7. Variables de entorno (backend en Render)

| Variable | Uso |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase (solo backend) |
| `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` | Service account Calendar (escapar `\n`) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Handshake GET /webhook |
| `META_APP_SECRET` | Firma X-Hub-Signature-256 |
| `META_GRAPH_API_VERSION` | Opcional, default v22.0 |
| `ADMIN_TOKEN` | Rutas /api/* (modo admin) |
| `DASHBOARD_ORIGIN` | CORS |
| `MAX_MESSAGES_PER_DAY` | Rate-limit diario (default 80) |
| `TZ` / `PORT` | Zona horaria fallback / puerto (Render lo inyecta) |

## 8. Estado del proyecto y hoja de ruta

Ver `GUIA-PASO-A-PASO.md` (pasos 0-6) y `docs/02-current-status.md`.
Resumen: bot funcional end-to-end (tienda demo validada). Pendiente por orden:
verificar BD real → sanear secretos → fix slots pasados → schema consolidado →
autenticación (Supabase Auth + store_users) → onboarding 4 pasos → caducidad
de tokens WhatsApp.
