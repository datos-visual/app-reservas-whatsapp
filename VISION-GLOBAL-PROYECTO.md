# CanalAgenda — Visión global del proyecto

> **Propósito de este documento:** dar a cualquier persona (o conversación de IA)
> el contexto completo del proyecto: qué es, por qué existe, cómo está construido,
> qué está hecho y verificado, y qué queda. Actualizado: **10 de julio de 2026**.
> Complementa a `INSTRUCCIONES-PROYECTO.md` (reglas fijas) y
> `GUIA-PASO-A-PASO.md` (plan de ejecución). Ante conflicto, INSTRUCCIONES manda.

---

## 1. Qué es CanalAgenda

**SaaS multi-tenant de reservas por WhatsApp para negocios con cita previa**
(peluquerías, talleres mecánicos, clínicas, gimnasios, casas rurales…).
El cliente final escribe (o llama) al negocio; un bot conversacional consulta
la disponibilidad real, confirma la cita, la guarda y crea el evento en el
Google Calendar de esa tienda. El dueño lo gestiona desde un panel web con
login propio. Marca comercial: **CanalAgenda**. Idioma del producto, código,
logs y documentación: **español**.

**La propuesta de valor no es "un bot de citas"** (eso se ha comoditizado: ver
§2). Es la combinación de:

1. **Reserva nativa dentro de WhatsApp** — sin apps, sin webs, en el canal que
   el 85%+ de los españoles ya usa (33M de usuarios, líder europeo).
2. **Hiperpersonalización por vertical** (visión de producto): catálogo de
   servicios del sector (corte/tinte; ITV/diagnóstico; habitación doble/
   apartamento), duraciones y recursos propios de cada gremio.
3. **Recuperación de llamadas perdidas** (módulo diferencial ya construido):
   llamada no contestada → WhatsApp automático con botón de reservar →
   métrica "citas recuperadas ≈ X €".
4. **Anti no-show** como argumento de venta: los negocios pierden 18-22% de
   citas; los recordatorios por WhatsApp lo reducen a la mitad o más
   (mejora nº1 pendiente, ver §7).

---

## 2. Estrategia (resumen del informe de viabilidad, jul-2026)

Documento completo: `INFORME-VIABILIDAD-CANALAGENDA.docx` (raíz de la carpeta
del proyecto). Conclusiones operativas:

- **Meta comoditizó el bot genérico:** el 03/06/2026 lanzó globalmente su
  *Meta Business Agent* (IA que reserva citas GRATIS dentro de WhatsApp).
  Consecuencia estratégica: no competir en "bot de citas", competir en
  **capa vertical profunda** (catálogos, recursos, integraciones, panel,
  determinismo) que Meta no cubre. Meta además educa al mercado a favor.
- **Competencia:** horizontales WhatsApp caros o genéricos (Wati ~149$/mes,
  SleekFlow ~399$); verticales belleza fuertes (Booksy 34,99€+8€/empleado,
  Fresha gratis+20% comisión) pero con WhatsApp solo como recordatorio;
  **talleres mecánicos casi vírgenes**. Casas rurales: posponer (exige pagos
  y channel manager — territorio AvaiBook).
- **Posicionamiento objetivo:** "reservas nativas por WhatsApp, por sectores,
  en español, 19-49 €/mes, **sin comisiones**".
- **Orden de verticales:** 1º talleres o peluquería/estética · 2º clínicas
  pequeñas y gimnasios boutique · 3º alojamiento rural.
- **Probabilidades estimadas** (con supuestos, ver informe): micro-SaaS
  rentable (50-100 clientes, 1,5-3k€ MRR a 18 meses) 20-35% con foco
  comercial; startup escalable 3-7%. **El riesgo dominante es comercial
  (distribución), no técnico.**
- **Go-to-market Fase 1:** 10 pilotos gratuitos de 60 días con instalación
  asistida ("te lo dejamos funcionando en una llamada; activo en 48-72 h"),
  venta presencial local, gestorías, Kit Digital. Convertir a 19-29 €/mes.
- **Regla de costes (inviolable):** ningún servicio que se coma el margen.
  Infraestructura actual < 35 €/mes; coste variable por tienda acotado por
  diseño (cupos, dedupe, locuciones cortas): ~2-4 €/mes el módulo de llamadas
  + ~0-10 € de plantillas WhatsApp.

---

## 3. Arquitectura técnica

### 3.1 Stack y despliegue

| Pieza | Tecnología | Dónde |
|---|---|---|
| Backend API + bot | Node.js / Express (stateless, sin disco) | Render: `https://app-whatsapp-backend.onrender.com` |
| Base de datos | Supabase (Postgres) — ÚNICA fuente de verdad | proyecto `jtdemvoqtalhbdotlduc` |
| Panel del negocio | Next.js 15 + Tailwind (App Router) | Render: `app-whatsapp-frontend` |
| Landing marketing | Next.js (repo separado `frontend-app-whatsapp`) | Render |
| Mensajería | WhatsApp Cloud API (Meta Graph, v22.0 configurable) | app Meta "App Reservas" |
| Calendario | Google Calendar API vía **service account compartida** (JWT) | proyecto Google `whatsapp-reservas-489313` |
| Voz (módulo missed-call) | Twilio Voice (DID español), tras interfaz `providers/` | cuenta "CanalAgenda" (trial) |
| Cron | cron-job.org (gratuito) cada 15 min | job → `/internal/missed-calls/dispatch` |
| Repo | GitHub `datos-visual/app-reservas-whatsapp` (rama main; deploy automático) | — |

Fechas/horas: **siempre luxon** con timezone por tienda. Errores: try/catch con
logs `[Modulo]` en español. Auth de BD: `SERVICE_ROLE_KEY` **solo en backend**
(bypassa RLS ⇒ cada query DEBE filtrar por `store_id`).

### 3.2 El núcleo multi-tenant (dos cadenas sagradas)

```
MENSAJE:  webhook Meta → metadata.phone_number_id → whatsapp_accounts(is_active)
          → store_id → resto de tablas
LLAMADA:  webhook Twilio → campo To (DID) → store_phone_numbers(is_active)
          → store_id → resto
ACCESO:   JWT Supabase Auth → auth.getUser → store_users → store_id de la sesión
          (el parámetro ?store_id= solo existe en modo admin con ADMIN_TOKEN)
```

El `store_id` **jamás** llega del exterior. Multi-tenant probado en datos
(2 tiendas) y en acceso (tests de aislamiento: un usuario con `?store_id=`
ajeno recibe SUS datos).

### 3.3 Garantías de integridad (no romper jamás)

- **Idempotencia de mensajes:** índice único parcial `(store_id, message_id)`
  sobre el WAMID + captura del error 23505. Meta reintenta webhooks.
- **Idempotencia de llamadas:** índice único parcial `(provider,
  provider_call_id)` sobre el CallSid. Twilio reintenta webhooks.
- **Anti doble-reserva:** índice único parcial `(store_id, start_at) WHERE
  status='confirmed'` + ROLLBACK del evento de Google Calendar si salta 23505.
  (Histórico: existía un UNIQUE FULL duplicado que impedía rereservar huecos
  cancelados; se eliminó con `migration_fix_appointments_unique_full.sql`.)
- **Dedupe missed-call:** PK compuesta `(store_id, phone, sent_on)` = máx. 1
  plantilla por cliente y día natural local; si Meta rechaza el envío, se
  libera el cupo del día.
- **Webhooks firmados:** Meta (HMAC-SHA256 + timingSafeEqual, `META_APP_SECRET`)
  y Twilio (HMAC-SHA1 sobre `PUBLIC_BASE_URL` exacta + params ordenados).
- **Webhook = 200 rápido** y proceso en background con `setImmediate`.
  Sin Redis ni colas: la "cola" del módulo missed-call es su propia tabla
  (`status='pending'`) + cron externo.

### 3.4 Decisiones cerradas de Fase 1 (no reabrir sin motivo)

Service account de Google **compartida** (cada tienda comparte su calendario
con ella y pega el ID) · conexión WhatsApp **semimanual** (la tienda/admin pega
`phone_number_id` + token permanente) · Supabase Auth email+contraseña ·
sin Redis · backend stateless · RLS habilitado sin políticas (acceso solo vía
backend) · procesos manuales aceptables si aceleran el time-to-market.
**Fase 2 con nombre:** *Embedded Signup* de Meta (Tech Provider + App Review)
para sustituir la pantalla manual de WhatsApp; OAuth de Google; SMTP +
confirmación de email; cifrado de tokens en columna.

---

## 4. Modelo de datos (14 tablas)

Fuente de verdad para recrear la BD: **`database/schema_consolidated.sql`**
(idempotente; generado de la foto real de producción — `schema.sql` es el
histórico obsoleto, NO usar). Resumen:

| Tabla | Rol |
|---|---|
| `stores` | Tenant: nombre, timezone, duración de cita, email/tel. de negocio |
| `store_users` | Vínculo usuario Supabase Auth ↔ tienda (rol owner/admin; 1 usuario→1 tienda en Fase 1) |
| `whatsapp_accounts` | phone_number_id, token (claro, Fase 1), waba_id, `token_expires_at` (null=permanente) |
| `calendar_connections` | google_calendar_id por tienda |
| `customers` | Cliente final, único por (store_id, phone) |
| `messages` | Log in/out con WAMID (idempotencia) |
| `appointments` | Citas: status pending/confirmed/cancelled, source whatsapp/admin, google_event_id |
| `conversation_state` | Estado del flujo (JSONB + expires_at) — PK (store_id, phone) |
| `store_business_hours` | Horario semanal (0=domingo; CHECK cerrado⇔horas null) |
| `store_phone_numbers` | DID de voz → store_id (módulo missed-call) |
| `missed_call_settings` | Config módulo: enabled, cupo, business_name, template_status, horario silencioso, ticket_medio_eur |
| `missed_calls` | Ciclo de vida de cada llamada: pending/sent/skipped + motivo + atribución |
| `missed_call_sends` | Dedupe 1/día (PK compuesta) |
| `contact_optouts` | Exclusión permanente por tienda (botón "No, gracias" o palabra BAJA) |

---

## 5. Funcionalidad construida (flujos)

### 5.1 Bot conversacional (cliente final, por WhatsApp)
Comandos: `DISPONIBLE YYYY-MM-DD` (huecos libres respetando horario, timezone,
eventos de Calendar y **sin ofrecer horas ya pasadas**) · `CITA fecha hora`
(reserva pendiente 10 min en `conversation_state`) · `SI` (revalida, crea
evento en Calendar, guarda cita; si carrera → rollback y aviso) · `NO`
(cancela la pendiente) · `AYUDA` · `BAJA` (opt-out permanente). Soporta
**botones** (plantillas quick-reply y mensajes interactivos) de forma genérica
(`kind`/`payload` en el extractor) — base para elegir servicio/hora tocando.
Rate-limit: 80 mensajes salientes/día por cliente.

### 5.2 Módulo "Llamada perdida → WhatsApp" (missed-call) — el diferencial
El negocio activa en su operadora el **desvío condicional** (códigos `**61*`,
`**67*`, `**62*`; doc cliente: `docs/onboarding-desvio-llamadas.md`) hacia un
DID de Twilio. Llamada no contestada → webhook → locución <10 s y cuelga →
motor de envío: comprobaciones en orden anti-coste (módulo activo → plantilla
aprobada → <48 h → no opt-out → horario silencioso 21-9 h local (encola) →
cupo mensual → cuenta WhatsApp → dedupe 1/día) → **plantilla de utilidad**
`canalagenda_missed_call_v1` con botones [Reservar cita] [Que me llamen]
[No, gracias]. Atribución: respuesta ≤48 h → conversación; cita confirmada
≤48 h → `resulted_in_booking_id` → métrica "N citas ≈ N×ticket_medio €".
Doc técnica completa: `docs/07-modulo-missed-call.md`.

### 5.3 Autenticación y panel (dueño del negocio)
Supabase Auth email+contraseña. Middleware dual: JWT de usuario (store_id
SIEMPRE de la sesión) o `ADMIN_TOKEN` (solo admin, puede elegir tienda).
Panel Next.js: login, estado de WhatsApp (con aviso de caducidad de token),
citas de hoy, últimos 50 mensajes, logout. Usuario sin tienda → redirigido al
onboarding.

### 5.4 Onboarding autoservicio (4 pasos, semimanual por diseño)
`/register` (alta y sesión inmediata; confirmación de email desactivada en
Fase 1) → `/onboarding/store` (nombre, timezone, duración; crea tienda +
vínculo owner + horario L-V 9-19 por defecto) → `/onboarding/calendar`
(instrucciones de compartir con la service account + ID + **botón "Probar
conexión"** que lista eventos) → `/onboarding/whatsapp` (phone_number_id +
token + **"Probar conexión"** contra la Graph API; el token nunca se muestra
de vuelta) → panel. Estado derivado draft → calendar_connected /
whatsapp_connected → ready (no se persiste). API: `POST /api/stores`,
`GET /api/store/status`, `POST /api/onboarding/{calendar,whatsapp}[/test]`.

### 5.5 Config y métricas del módulo (M5)
`GET/PUT /api/missed-call/settings` (whitelist de campos) y
`GET /api/missed-call/metrics?month=YYYY-MM`: llamadas capturadas, plantillas
enviadas, conversaciones, callbacks pendientes (lista), citas recuperadas,
**euros estimados**, desglose de descartes.

---

## 6. Estado: hecho y verificado (julio 2026)

Todo el plan técnico original (pasos 0-6 de `GUIA-PASO-A-PASO.md`) y el módulo
missed-call (M1-M6) están **construidos, desplegados y probados**:

- ✅ Saneamiento inicial: bug del UNIQUE FULL corregido en producción; schema
  consolidado como fuente de verdad; fix de huecos pasados (validado con
  llamada real: a las 16:03 solo ofreció 16:30); `.gitattributes`; CORS
  multi-origen; secretos fuera de git (verificado historial completo).
- ✅ Bot validado end-to-end con **número real español** (+34, phone_number_id
  1152054277985066, WABA 1283216857357080) — mensajes, reservas y eventos en
  Calendar reales.
- ✅ Missed-call M1-M6: 5 tablas, webhook voz firmado, motor con 16 tests,
  botones genéricos, opt-out, atribución, despachador + cron operativo (200 OK),
  documentación técnica y de cliente.
- ✅ Auth (paso 4): middleware dual con 7 tests de aislamiento; login/logout
  en panel; `NEXT_PUBLIC_ADMIN_TOKEN` y `whatsappClient.js` (legacy QR)
  eliminados.
- ✅ Onboarding (paso 5): circuito completo probado a mano de punta a punta
  (registro → tienda → calendario real conectado y test ✓ → WhatsApp ficticio
  y test ✗ esperado → panel aislado) **sin tocar SQL**.
- ✅ Caducidad de tokens (paso 6): columna + avisos en panel/API/cron,
  verificado visualmente ("caduca en 2 días").
- ✅ Estilos del frontend arreglados (Tailwind escaneaba `src/` inexistente;
  faltaban `globals.css` y su import).
- ✅ Informe de viabilidad (13 págs., .docx) con investigación de mercado.

**Tienda demo:** `store_id = 0aa6d8d7-7be8-4292-8a6b-cac0a0c917da` (usuario
panel: piloto1@test.com).

---

## 7. Qué queda por hacer

### 7.1 Operación inmediata (en curso, sin código)
1. **Twilio:** regulatory bundle español enviado (Individual) → al aprobarse:
   comprar DID Voice, apuntar webhook a `/webhook/voice/twilio`, `insert` en
   `store_phone_numbers`, llamada de prueba. Credenciales en Render; alerta
   de gasto 10 $/mes creada; cuenta en trial (sin riesgo de cobro).
2. **Meta:** plantilla `canalagenda_missed_call_v1` (Utilidad, es) → al
   aprobarse: `template_status='approved'` → **primera demo completa del
   módulo** (llamar → no contestar → WhatsApp → reservar → métrica en €).
3. **Seguridad pendiente:** rotar token GitHub `ghp_` y ADMIN_TOKEN definitivo
   (salieron en capturas); sacar de la carpeta compartida `GIT/CONFIG/
   config.txt`, `JSON/` (service account) y los ZIPs con `.env`.
4. **Render frontend:** añadir las 4 variables `NEXT_PUBLIC_*` y verificar
   producción como local.

### 7.2 Fase B — requisitos de vender en serio (semanas)
Verificación de empresa en Meta Business + display name · RGPD (aviso de
privacidad, encargado del tratamiento por tienda, retención de mensajes) ·
términos y precios publicados · alta de actividad y facturación (Stripe) ·
backups Supabase Pro + monitorización /health con alertas · runbook de
incidencias.

### 7.3 Mejoras de producto priorizadas (impacto/esfuerzo, del informe)
1. **Recordatorios anti no-show** (plantilla utility 24 h/2 h antes con
   botones Confirmo/Cancelar) — el argumento de venta nº1. ← *siguiente*
2. Comandos **CANCELAR** y **MIS CITAS** para el cliente final.
3. **Catálogo de servicios por vertical** (duración/precio por servicio) —
   corazón de la hiperpersonalización.
4. Multi-recurso (empleado/sillón/elevador/habitación).
5. Lenguaje natural (LLM solo para interpretar intención; lógica determinista).
6. Botones/listas interactivas para elegir servicio y hora (extractor ya listo).
7. Señas con Stripe · 8. Panel con métricas anti no-show · 9. Plantillas de
   configuración por sector.

### 7.4 Fase C — pilotos (objetivo septiembre 2026)
Elegir vertical 1 (talleres o peluquería) → plantilla de configuración del
sector → 10 pilotos gratuitos 60 días con instalación asistida → medir
(citas, no-shows, llamadas recuperadas) → convertir a 19-29 €/mes → caso de
éxito con cifras.

### 7.5 Fase 2 técnica (cuando el negocio valide)
Embedded Signup de Meta (elimina la pantalla manual de WhatsApp) · OAuth
Google Calendar · SMTP + confirmación de email · cifrado de tokens · migrar
DIDs a Telnyx si el volumen lo justifica (20-30% más barato) · bundles ISV de
Twilio con datos de cada tienda cliente.

---

## 8. Mapa del repositorio y documentos clave

```
GIT/app-whatsapp/                      ← repo principal (main → deploy Render)
├── backend/src/
│   ├── index.js          Express: webhooks (Meta + voz), rutas /api/*, despachador
│   ├── auth.js           Middleware dual JWT/admin + requireStoreId
│   ├── db.js             Queries core (siempre por store_id)
│   ├── calendar.js       Google Calendar + generación de huecos (luxon)
│   ├── whatsappCloud.js  Firma Meta, envío texto/plantillas, extractor genérico
│   ├── missedCall.js     Módulo missed-call completo (motor, métricas, optout)
│   ├── onboarding.js     Alta de tienda, conexiones, tests, tokens caducidad
│   └── providers/twilioVoice.js  Interfaz proveedor de voz
├── frontend/             Panel Next.js (login, register, onboarding/, dashboard)
├── database/
│   ├── schema_consolidated.sql   ★ FUENTE DE VERDAD de la BD
│   └── migration_*.sql           histórico aplicado (idempotentes)
├── docs/                 00-07 + onboarding-desvio-llamadas.md (cliente final)
├── INSTRUCCIONES-PROYECTO.md     ★ reglas inviolables + DoD
├── GUIA-PASO-A-PASO.md           ★ plan por pasos con estado
└── VISION-GLOBAL-PROYECTO.md     ★ este documento

Raíz de la carpeta compartida:
└── INFORME-VIABILIDAD-CANALAGENDA.docx   ★ estrategia y mercado (13 págs.)
```

## 9. Reglas de trabajo (resumen; detalle en INSTRUCCIONES-PROYECTO.md)

1. Todo por `store_id`; nunca llega del exterior. 2. Backend stateless.
3. Idempotencia y anti doble-reserva intocables. 4. Webhooks: 200 rápido +
background. 5. Secretos solo en variables de entorno del backend (nunca
frontend/git). 6. Español en todo; luxon para fechas; logs `[Modulo]`.
7. Migraciones SQL idempotentes + actualizar el consolidado. 8. **Regla de
costes:** free tier o céntimos; coste variable acotado por diseño.
9. Estudiar antes de tocar; plan y OK antes de cambios irreversibles;
incrementos pequeños con paso de verificación (Definition of Done).
10. El perfil del dueño del proyecto es no-técnico en infra: las instrucciones
operativas deben ser paso a paso, con pantallas y comandos exactos.
