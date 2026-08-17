# CanalAgenda — Visión global del proyecto

> **Propósito de este documento:** dar a cualquier persona (o conversación de IA)
> el contexto completo del proyecto: qué es, por qué existe, cómo está construido,
> qué está hecho y verificado, y qué queda. Actualizado: **3 de agosto de 2026**.
> Complementa a `INSTRUCCIONES-PROYECTO.md` (reglas fijas), `GUIA-PASO-A-PASO.md`
> (plan histórico de saneamiento), `docs/08-especificacion-guiones-verticales.md`
> (especificación vigente del flujo guiado y los verticales — **el plan activo de
> desarrollo es su orden de bloques B1-B7**) y `docs/09-roadmap-premium-peluqueria.md`
> (mejoras premium evaluadas y su diseño). Ante conflicto, INSTRUCCIONES manda.
> **Si eres una conversación/modelo nuevo: empieza por el §10 (protocolo de
> continuidad).**

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
- **Lenguaje de modelos de reserva (decisión estratégica, jul-2026):** todo
  vertical se clasifica en uno de tres modelos — **A**: hueco con duración y
  recursos (peluquería, clínica); **B**: capacidad por franja/pool (taller por
  nº de trabajos, clases de gimnasio) — variante barata de A vía parámetro de
  capacidad; **C**: inventario de unidades por noche (rural/hotel) — módulo
  hermano futuro, NO forzarlo en A. El motor es único y genérico; el vertical
  es configuración: `vertical_code` + catálogo `services` editable + semilla
  por sector + **configurador guiado en el onboarding** (pieza de producto,
  no mejora menor). El 80% del sistema (tenant, canal, NLU, recordatorios,
  panel, cobro) es común a los tres modelos.
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
**El cliente habla en lenguaje natural** (los comandos siguen funcionando por
debajo como capa determinista): "¿tenéis hueco mañana por la tarde?" (franja
mañana/tarde filtra huecos), "el de las 12" tras una lista, "resérvame a las
nueve y media" (hereda el día del contexto de conversación, con red
determinista si el modelo falla), "¿qué citas tengo?", "cancela la de las
16:00" (directo a confirmación, sin listas), "cambia la de hoy a las 16 a las
15:30" (identifica cita ORIGEN y destino; si falta un dato lo pregunta y
recuerda el resto; al confirmar reserva la nueva Y anula la vieja). Tras la
primera reserva pide **el nombre del cliente** (con prefijos naturales: "a
nombre de...", "me llamo..."). Saludos y mensajes no entendidos → **menú de
bienvenida con botones nativos** [Reservar cita] [Mis citas] [Hablar con
alguien] (B1). Fechas siempre en formato humano ("el miércoles 15/07 a las
09:30"), sin IDs ni coletillas técnicas. Elecciones entre citas por lenguaje
natural ("la del miércoles", "la segunda") con salida de emergencia
anti-bucle. Rate-limit: 80 mensajes salientes/día por cliente. Reserva
validada contra horario, timezone, eventos de Calendar y horas pasadas;
confirmación SI/NO con revalidación y rollback ante carreras.

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

### 5.6 NLU — intérprete de lenguaje natural (`nlu.js`)
Principio inviolable: **la IA solo interpreta, nunca decide ni responde** —
convierte texto libre en {intent, date, time, franja, old_date, old_time} y la
lógica determinista actúa. Proveedores **Gemini y Mistral** tras interfaz común
con cascada titular→suplente (`NLU_PROVIDERS`, claves en env; free tiers sin
tarjeta). Prompt con contexto conversacional (últimos 6 mensajes, 30 min),
ejemplos few-shot, salida JSON validada estrictamente y **degradación elegante**:
sin claves/timeout/duda → comandos de siempre. `interpretChoice` elige entre
opciones numeradas en lenguaje natural.

### 5.7 Recordatorios anti no-show (R1)
Plantilla `canalagenda_reminder_v1` a las **24 h y 2 h** de cada cita
confirmada, con botones [Confirmo] (marca `confirmed_by_client_at`) y
[Cancelar cita] (entra al flujo SI/NO). Anti-spam: 1 por ventana (tracking en
`appointments`), zona muerta 2-4 h, horario silencioso, opt-out respetado, sin
reintentos en bucle. Despacho en el cron existente. Config por tienda en
`reminder_settings` (enabled, template_status...). **Evolución prevista en B4
del doc 08** (tabla `appointment_reminders` + plantillas con nombre del
servicio) cuando exista el catálogo B2.

### 5.8 Flujo guiado con botones (B1 hecho; B2-B7 en curso)
Senders nativos `sendInteractiveButtons`/`sendInteractiveList` (gratis en
ventana 24 h), router de payloads `ca:*` con validación contra store_id y
manejo de payloads caducados, menú de bienvenida. Los bloques B2 (catálogo de
servicios + duración variable), B3-B7 siguen el doc 08.

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
- ✅ **NLU completo (N1-N7)**: Gemini+Mistral en cascada, contexto
  conversacional, franjas, CAMBIAR cita por pasos, cancelación directa por
  hora, captura de nombre — **pulido con 4 rondas de pruebas reales por
  WhatsApp** del fundador (los fallos de cada ronda alimentaron la siguiente).
- ✅ CANCELAR / MIS CITAS / CAMBIAR conversacionales (R2+N5+N6), sin IDs.
- ✅ Recordatorios R1 (migración + motor + botones + cron), armado a la espera
  de la plantilla de Meta.
- ✅ B1 del doc 08: senders interactivos nativos, router `ca:*` y menú de
  bienvenida con botones.
- ✅ Doc 08 (especificación de flujo guiado y verticales, de la conversación
  paralela de negocio) leído y reconciliado con lo construido.
- ✅ **B2 completo y probado en real (17-jul):** migración de catálogo
  (`services`, `resources`, `vertical_code`, columnas en `appointments`) +
  seed peluquería (7 servicios) + flujo guiado Servicio→Día→Hueco→Confirmar.
  Verificado: Tinte de 120 min crea evento de 2 h en Calendar con nombre de
  servicio y cliente. Lección aprendida: **SQL primero, deploy después**
  (el insert de citas quedó además tolerante a BD sin migrar).
- ✅ **B2.1/B2.2 (17-jul):** lista de días tipo mini-calendario (Hoy, Mañana
  y 7 días siguientes + "Otro día"; el date-picker real existe vía WhatsApp
  Flows — anotado para B6, complica el alta por tienda) y personalización:
  saludo "¡Hola de nuevo, {nombre}!" y confirmación "a tu nombre" cuando el
  cliente es conocido (`getCustomerByPhone`, lectura sin efectos).
- ✅ **Doc 09:** seis ideas premium del fundador evaluadas y diseñadas
  (compactación de agenda, reactivación por ciclo, lista de espera, modo
  oferta, ficha de estilo, post-venta) con paquetización y motor proactivo
  común.
- ✅ **P1 `smart_slots` (17-jul, v2 tras feedback):** los huecos se listan
  SIEMPRE en orden cronológico; el flag prioriza en la selección y marca con
  ⭐ + leyenda los huecos adyacentes a citas. Sin incentivos por elegirlos
  (decisión: medir adopción primero). Testeado en /tmp y en real.
- ✅ **A1 backoffice `/admin` (doc 10):** vista de TODAS las tiendas con
  salud, incidencias derivadas automáticamente y toggles de los 6 flags
  premium. ADMIN_TOKEN tecleado a mano (solo sessionStorage). Probado en
  real (detectó "Store demo 2: WhatsApp sin conectar").
- ✅ **A2 `/servicios`:** dos niveles — contratado (admin/plan, columna
  `premium_features`) vs activado (tienda, columna `features_disabled`);
  efectivo = contratado MENOS desactivado. La tienda gestiona lo suyo, nunca
  se autoactiva lo no contratado (403). Botón "Servicios" en el dashboard.
- ✅ **B3 (17-jul):** "Mis citas" es lista interactiva → botones [Cambiar
  hora | Cancelar cita | Nada] por cita (payloads `ca:apt:*` validados
  contra las citas del propio cliente); cancelación con botones Sí/No que
  reutilizan el circuito SI/NO. Aviso de día incongruente ("el martes 22"
  cuando el 22 es miércoles) en flujo guiado y NLU.
- ✅ **P3 lista de espera (flag `waitlist`):** sin huecos → [Apúntame ⏰]
  (dedupe 1/cliente/día por índice parcial); al cancelarse o cambiarse una
  cita se avisa al PRIMERO en espera de ese día (hook fire-and-forget que
  jamás afecta a la cancelación); el hueco NO se bloquea. Módulo
  `waitlist.js` + `migration_waitlist.sql`.
- ✅ **Panel desplegado en Render (17-jul):** el servicio
  `app-whatsapp-frontend` (repo principal, root `frontend`) llevaba 10 días
  en Failed deploy por falta de variables `NEXT_PUBLIC_*`; añadidas y
  funcionando. Páginas nuevas en tema oscuro del panel.
- ✅ **B6 núcleo (19-jul):** catálogo autoservicio — `catalog.js` +
  API `GET/POST/PUT /api/services`, `GET /api/verticals`,
  `POST /api/store/vertical` (semilla idempotente por nombre); página
  **`/catalogo`** del panel (editar nombre/duración/precio/descripción/
  visible + crear servicios, botón "Catálogo" en el dashboard); paso
  **`/onboarding/vertical`** tras crear la tienda (elige peluquería/taller/
  vacío y copia la semilla EDITABLE). Validación testada en /tmp.
  Pendiente de B6: date-picker por WhatsApp Flows y pulido del configurador.
- ✅ **P3.2 (19-jul):** el aviso de lista de espera intenta texto libre y,
  si Meta lo rechaza (ventana 24 h cerrada), cae a la plantilla
  `canalagenda_waitlist_v1` (payloads WAITLIST_YES/NO) — en cuanto Meta la
  apruebe funcionará solo, sin tocar código. Estado `waitlistOffer` (6 h):
  responder "sí" o [Lo quiero] reserva el hueco directamente vía CITA.
- ✅ **A3 (19-jul):** "Ver actividad" por tienda en `/admin` (últimos 30
  mensajes + próximas 10 citas) y **`docs/runbook-incidencias.md`** —
  síntoma→causa→solución de todo lo aprendido (leerlo ante cualquier fallo).
- ✅ **Bloque 1 completo (28-jul → 3-ago):** la tienda ya no depende del
  admin para su día a día — **horarios y vacaciones** editables (`/horarios`,
  con `getDayHours` como única fuente de verdad y regla *fail-safe*: día sin
  horario configurado = CERRADO), y **agenda con citas manuales**
  (`/agenda` + `agenda.js`): apuntar las que entran por teléfono pasando por
  las MISMAS garantías que el bot, cancelar avisando a la clienta por
  WhatsApp y aviso automático a la lista de espera al liberarse el hueco.
- ✅ **N8 nombre desde el perfil de WhatsApp (verificado 30-jul):** el nombre
  se toma del perfil si parece de persona (heurística probada con 13 casos),
  se propone en la confirmación y se corrige diciendo "me llamo…". Nunca pisa
  un nombre dado por la persona o el negocio. Columna `customers.name_source`.
  **Decisión de privacidad escrita:** los clientes son de CADA tienda; el
  mismo teléfono en dos negocios son dos fichas y no se comparte nada.
- ✅ **Backoffice completo (3-ago):** alta de tienda de punta a punta desde
  `/admin` (negocio + usuario del panel con contraseña + catálogo del sector),
  conexión de Calendar y WhatsApp por tienda (los endpoints ya aceptaban
  `?store_id=` en modo admin), activación de plantillas y módulos sin SQL,
  actividad por tienda y **estadísticas agregadas**.
- ✅ **Rediseño de usabilidad (3-ago):** tema CLARO con sistema propio
  (`globals.css`: `ca-card`, `ca-btn-*`, `ca-input`, `ca-badge-*`),
  `components/AppShell.tsx` con **el nombre del negocio siempre visible** y
  navegación por pestañas con iconos SVG propios (`components/icons.tsx`).
  ⚠️ El build de Render usa `noUnusedLocals`: **cualquier variable sin usar
  rompe el despliegue** (pasó con `negocio` en horarios). Verificar con
  `./node_modules/.bin/tsc --noEmit` antes de cada push del frontend.
- 🔨 **B5.1 EN CURSO (3-ago) — equipo con nombres, turnos y ausencias:**
  `migration_equipo.sql` (turnos, ausencias, `resources.units` y la
  **migración consciente del índice anti doble-reserva**), `equipo.js`
  (disponibilidad por persona y reparto equilibrado), integración en los 6
  caminos de huecos, API `/api/equipo` y pantalla `/equipo`.
  **Pendiente de que el fundador ejecute la migración y lo pruebe.**
- ⚠️ **AVISO sobre los 7 interruptores premium (3-ago):** el sistema de
  contratación está completo (flags, backoffice, panel de la tienda), pero
  **solo DOS servicios están construidos: P1 `smart_slots` y P3 `waitlist`**.
  Los otros cinco (`reactivation`, `post_sale`, `style_file`, `flash_offers`,
  `elegir_profesional`) son **solo el interruptor**: activarlos no hace nada
  y tampoco da error. No enseñarlos como disponibles a un cliente hasta
  construirlos. Estado visual siempre actualizado en `ESTADO-DEL-PROYECTO.html`.
- 📤 **Plantillas enviadas a Meta el 19-jul:** `canalagenda_reminder_v2`
  (Servicio, 4 variables con servicio), `canalagenda_waitlist_v1`
  (Meta la forzó a MARKETING) y `canalagenda_reactivacion_v1` (Marketing).
  Al aprobar: reminder_v2 requiere B4 (código nuevo); waitlist_v1 funciona
  sola (P3.2 ya la usa); reactivacion_v1 espera al motor proactivo (P2).

**Tienda demo:** `store_id = 0aa6d8d7-7be8-4292-8a6b-cac0a0c917da` (usuario
panel: piloto1@test.com). **Plantillas Meta:** `canalagenda_missed_call_v2` y
`canalagenda_reminder_v1` **APROBADAS** (16-jul); activarlas requiere los dos
UPDATE de `template_status` (+`template_name` a v2 en missed_call_settings) —
verificar si ya se ejecutaron. La v1 de missed-call NO sirve (botón de permiso
de llamada). **Twilio:** cuenta upgraded con credenciales Live; España no se
vende en autoservicio → decisión del fundador: **solicitar número exclusivo
español y esperar** (módulo de voz aparcado; al retomarlo: SID/token en
Render, webhook de voz, insert del DID en `store_phone_numbers`).

---

## 7. Qué queda por hacer

> **★ Backlog completo y priorizado: `docs/12-backlog-producto.md` (28-jul).**
> Recoge lo que falta para pasar de "funciona" a "vendible": horarios y citas
> manuales desde el panel (bloque 1, crítico), equipo con turnos/ausencias/
> habilidades y disponibilidad real (bloque 2 = B5 ampliado, incluye un cambio
> arquitectónico: la ocupación por profesional pasa a calcularse desde NUESTRA
> BD, no desde Calendar), textos del bot personalizables por tienda (bloque 3),
> y producto/negocio: métricas, ficha de cliente, Stripe, RGPD (bloque 4).

### 7.1 Desarrollo — plan activo (B2 ✅ B3 ✅ P1 ✅ P3 ✅ A1/A2 ✅)
1. **Verificaciones del fundador ← ANTES DE SEGUIR:** prueba real de B3
   (mis citas con botones), de P3 (apuntarse + aviso al cancelar) y del
   **recordatorio R1** (cita a ~5 h → plantilla [Confirmo]/[Cancelar cita]),
   que sigue sin probarse en real.
2. **B4 (bloqueado por plantilla Meta):** recordatorios con nombre del
   SERVICIO exigen plantilla nueva con variable extra → el fundador debe
   crearla y esperar aprobación antes de codificar contra ella.
3. **Motor proactivo + P2 reactivación (doc 09 §4):** requiere plantilla
   MARKETING aprobada + consentimiento (`customers.marketing_consent_at`).
   No construir a ciegas: plantilla primero.
4. **B5:** recursos/empleados (capacidad real — `generateSlots` ya acepta
   `capacity`), paquete taller. ⚠️ multi-recurso exige la migración
   consciente del índice anti doble-reserva.
5. **B6:** núcleo ✅ HECHO 19-jul (catálogo editable `/catalogo` +
   `/onboarding/vertical` con semilla). Queda: pulido del configurador,
   onboarding conversacional (híbrido con botones, sin LLM libre) y el
   date-picker de WhatsApp Flows (doc 09 §P0). ⚠️ Probar en real: registro
   nuevo → vertical → catálogo → reservar por WhatsApp un servicio creado
   a mano desde el panel.
6. **B7 / P6 / P5 / P4:** sobre el motor proactivo, en el orden del doc 09
   §5 (Modo Oferta SIEMPRE el último y con cupos).

### 7.2 Operación inmediata (gestiones del fundador)
1. **Meta:** esperando aprobación de `canalagenda_missed_call_v2` y
   `canalagenda_reminder_v1` → al llegar, los dos UPDATE de `template_status`
   (y `template_name` a v2 en missed_call_settings) → demo completa: llamada
   perdida → WhatsApp → reserva hablando → recordatorio → métricas en €.
2. **Twilio:** poner `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` en Render
   (acceso a la cuenta pendiente de recuperar), comprar el número belga
   (Mobile, address requirement "Any" con la dirección española), webhook de
   voz e `insert` del DID. Para el +34 de producción: formulario "Número
   Exclusivo" o ticket (España no está en autoservicio).
3. **Seguridad (arrastrado):** rotar token GitHub y ADMIN_TOKEN definitivos
   (salieron en capturas); sacar de la carpeta compartida `GIT/CONFIG/
   config.txt`, `JSON/` y los ZIPs con `.env`. Identidades git: usar SOLO
   `datos-visual`.
4. **Render frontend:** variables `NEXT_PUBLIC_*` en producción.

### 7.3 Fase B — requisitos de vender en serio (semanas)
Verificación de empresa en Meta Business + display name · RGPD (aviso de
privacidad, encargado del tratamiento por tienda, retención de mensajes;
mención del NLU: mensajes procesados por proveedor de IA — en pilotos pasar
las claves NLU a tier de pago sin uso de datos) · términos y precios
publicados · alta de actividad y facturación (Stripe) · backups Supabase Pro +
monitorización /health con alertas · runbook de incidencias.

### 7.4 Fase C — pilotos (objetivo septiembre 2026)
Elegir vertical 1 (talleres o peluquería) → B2-B6 mínimos + configurador →
10 pilotos gratuitos 60 días con instalación asistida → medir (citas,
no-shows, llamadas recuperadas, € estimados) → convertir a 19-29 €/mes →
caso de éxito con cifras.

### 7.5 Puntos de vigilancia del mercado (revisar cada pocos meses)

1. **WhatsApp Business Calling API (Meta, doc actualizada 26-jun-2026).**
   Llamadas de voz VoIP *dentro de WhatsApp*, sobre el mismo número de la
   empresa; en beta limitada (disponibilidad en España sin confirmar a
   28-jul-2026). **NO sustituye al módulo missed-call:** el nuestro captura
   llamadas al teléfono NORMAL del negocio (PSTN) vía desvío de operadora;
   Calling solo existe si el cliente pulsa "llamar" desde el chat.
   **Qué vigilar:** si Meta emite webhook de *llamada de WhatsApp no
   contestada*, se podría replicar el valor del módulo **sin Twilio, sin DID
   y sin coste de telefonía** — sería un cambio estratégico importante.
   **Por qué NO ahora:** beta, y atender llamadas reales exige infraestructura
   de voz en tiempo real (choca con la regla de costes). Decisión 28-jul-2026:
   *vigilar, no construir*.
2. **Precios de plantillas de Meta:** cambiaron el **1 de julio de 2026** y
   España está entre los países afectados. ⚠️ Las cifras del
   `INFORME-VIABILIDAD-CANALAGENDA.docx` y los cupos por plan (doc 09 §3) se
   calcularon con las tarifas anteriores: **verificar precios actuales de
   marketing y servicio en España antes de fijar precios de venta.** Pendiente.

### 7.6 Fase 2 técnica (cuando el negocio valide)
Embedded Signup de Meta (elimina la pantalla manual de WhatsApp) · OAuth
Google Calendar · SMTP + confirmación de email · cifrado de tokens · migrar
DIDs a Telnyx si el volumen lo justifica · bundles ISV de Twilio por tienda ·
**modelo C (estancias/rural)** como módulo hermano · multi-recurso simultáneo
(migración consciente del índice anti doble-reserva).

---

## 8. Mapa del repositorio y documentos clave

```
GIT/app-whatsapp/                      ← repo principal (main → deploy Render)
├── backend/src/
│   ├── index.js          Express: webhooks (Meta + voz), flujos conversacionales,
│   │                     router ca:*, menú, rutas /api/*, despachador del cron
│   ├── auth.js           Middleware dual JWT/admin + requireStoreId
│   ├── db.js             Queries core (siempre por store_id)
│   ├── calendar.js       Google Calendar + generación de huecos (luxon)
│   ├── whatsappCloud.js  Firma Meta, texto/plantillas/BOTONES Y LISTAS nativas,
│   │                     extractor genérico (texto/button/interactive)
│   ├── nlu.js            Intérprete de lenguaje natural (Gemini+Mistral, cascada)
│   ├── reminders.js      Recordatorios anti no-show 24h/2h (R1)
│   ├── missedCall.js     Módulo missed-call completo (motor, métricas, optout)
│   ├── admin.js          Backoffice A1/A2: overview global, flags, estado
│   │                     contratado/activado (única excepción multi-tienda)
│   ├── waitlist.js       P3: lista de espera (alta, primero en cola, avisado)
│   ├── verticals.js      Semillas de servicios por vertical (peluquería, taller)
│   ├── onboarding.js     Alta de tienda, conexiones, tests, tokens caducidad
│   └── providers/twilioVoice.js  Interfaz proveedor de voz
├── frontend/             Panel Next.js (login, register, onboarding/, dashboard,
│                         admin/ backoffice, servicios/ toggles de la tienda)
├── database/
│   ├── schema_consolidated.sql   ★ FUENTE DE VERDAD de la BD (16 tablas)
│   └── migration_*.sql           histórico aplicado (idempotentes; últimas:
│                                 catalogo_servicios, premium_features, waitlist)
├── scripts/seed_demo_peluqueria.sql  seed de 7 servicios de la tienda demo
├── docs/                 00-07 + onboarding-desvio-llamadas.md (cliente final)
│   ├── 08-especificacion-guiones-verticales.md  ★ PLAN ACTIVO (bloques B1-B7)
│   ├── 09-roadmap-premium-peluqueria.md  ★ premium evaluado (P1/P3 hechos)
│   └── 10-backoffice-administracion.md   ★ backoffice y niveles de control
├── INSTRUCCIONES-PROYECTO.md     ★ reglas inviolables + DoD
├── GUIA-PASO-A-PASO.md           ★ plan histórico de saneamiento (completado)
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

---

## 10. Protocolo de continuidad (conversación o modelo de IA nuevo)

El proyecto se ha desarrollado íntegramente en conversaciones con IA. Si esta
conversación cambia de modelo o empieza de cero, **el contexto vive en estos
documentos, no en la memoria de la conversación**. Protocolo de arranque:

### 10.1 Orden de lectura obligatorio
1. `INSTRUCCIONES-PROYECTO.md` — reglas inviolables (manda sobre todo).
2. `VISION-GLOBAL-PROYECTO.md` (este) — qué es, arquitectura, estado, plan.
3. `docs/08-especificacion-guiones-verticales.md` — plan activo B1-B7.
4. `docs/09-roadmap-premium-peluqueria.md` — premium evaluado (si aplica).
5. `database/schema_consolidated.sql` — foto real de la BD (no `schema.sql`).
6. El código de la zona a tocar, ENTERO, antes de editar.

### 10.2 Método de trabajo que ha funcionado (mantener)
- Estudiar → proponer plan → **esperar OK del fundador** → incrementos
  pequeños → verificación (DoD) → el fundador prueba EN REAL por WhatsApp y
  aporta capturas; sus fallos alimentan la siguiente iteración.
- Instrucciones operativas para el fundador: numeradas, con el comando o la
  pantalla exacta, en español. Él ejecuta el SQL en Supabase, los `git push`
  y las gestiones de consolas (Meta/Twilio/Render/cron-job.org).
- **Orden sagrado en cambios con BD: migración SQL primero, deploy después.**
- Migraciones idempotentes + reflejar SIEMPRE en `schema_consolidated.sql`.

### 10.3 Trampas conocidas del entorno (aprendidas a golpes)
- **Caché del sandbox:** los ficheros MODIFICADOS pueden servirse rancios o
  truncados en el shell Linux (a veces parsean pero pierden exports). Lo
  autoritativo es Read/Grep sobre la carpeta de Windows; para probar lógica,
  copiar a /tmp y testear allí. Un `node --check` solo es concluyente si se
  verificó que el mount está fresco (grep de un cambio recién hecho).
- El repo real está en `GIT/app-whatsapp` (la carpeta `APP-RESERVAS-WHATSAPP`
  raíz es un espejismo casi vacío).
- Identidad git: SOLO `datos-visual` (credenciales de otro usuario en el
  Credential Manager de Windows causaron pushes denegados).
- Meta renombró categorías de plantillas ("Utilidad"→"Servicio"); la opción
  "Solicitud de permisos de llamada" produce plantillas inservibles aquí.
- Los webhooks de Meta/Twilio reintentan: cualquier handler nuevo necesita
  idempotencia desde el primer día.
- `pip` en el sandbox requiere `--break-system-packages`.

### 10.4 Estado de credenciales y servicios (a 17-jul-2026, tarde)
- Render, 3 servicios: `app-whatsapp-backend` (Node, repo principal),
  **`app-whatsapp-frontend` = EL PANEL** (repo principal, Root Directory
  `frontend`, con `NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` configuradas el 17-jul) y la landing
  (repo separado `frontend-app-whatsapp` — ¡no confundir!, no tiene /login).
  Deploy automático con cada push a `main`.
- Rutas del panel: `/login` `/` (dashboard) `/servicios` (tienda) `/admin`
  (backoffice; pide ADMIN_TOKEN a mano, vive en Render backend → Environment).
- CORS: `DASHBOARD_ORIGIN` (backend) es lista separada por comas y debe
  incluir la URL del panel.
- Cron: cron-job.org cada 15 min → `/internal/missed-calls/dispatch` con
  cabecera `x-internal-token` (despacha missed-calls + recordatorios + avisos
  de tokens).
- NLU: claves Gemini/Mistral en env de Render (`NLU_PROVIDERS`).
- Usuario demo del panel: piloto1@test.com (email FICTICIO: el "password
  recovery" no funciona; para resetear su contraseña, SQL:
  `update auth.users set encrypted_password = extensions.crypt('NUEVA',
  extensions.gen_salt('bf')) where email = 'piloto1@test.com';`).
- Plantillas Meta APROBADAS: `canalagenda_missed_call_v2` y
  `canalagenda_reminder_v1` (verificar si los UPDATE de activación en
  missed_call_settings/reminder_settings ya se ejecutaron).
- Pendientes de seguridad del fundador: rotar token GitHub y ADMIN_TOKEN
  definitivos; sacar `CONFIG/config.txt`, `JSON/` y ZIPs con `.env` de la
  carpeta compartida.
- Twilio aparcado esperando número español (§6).

### 10.4.bis Acceso al panel (3-ago-2026)
Usuario operativo: **jm@canalagenda.local**, vinculado a **Store demo**
(`0aa6d8d7-…`), que es la tienda con el número real de WhatsApp. `piloto1`
(misma tienda, contraseña perdida) y `piloto2` (Tienda Prueba Onboarding)
quedan como históricos. **Incidente aprendido:** se estuvo configurando la
tienda equivocada durante media sesión; por eso el panel muestra ahora el
nombre del negocio en la cabecera. Para crear usuarios: Supabase →
Authentication → **Add user** (con *Auto Confirm*) + `insert` en
`store_users`, o directamente el alta desde `/admin`.

### 10.5 Estado de las pruebas reales (actualizado 28-jul-2026)
1. ✅ **R1 recordatorio VERIFICADO (28-jul):** cita a 33 min → plantilla
   recibida con botones. ⚠️ El 2º botón dice "Confirmar cita" en lugar de
   "Cancelar cita" (texto mal escrito AL CREAR la plantilla en Meta; el
   código manda las acciones por posición y funciona bien). Corregir en
   WhatsApp Manager y revisar los botones de `reminder_v2`.
2. ✅ **Flujo guiado B2/B6 verificado (27 y 28-jul):** saludo con nombre,
   catálogo con precios, mini-calendario, confirmación "a tu nombre".
3. ⏳ B3: `mis citas` → tocar cita → [Cambiar|Cancelar|Nada] → cancelar Sí/No.
4. ⏳ Aviso de fecha incongruente ("el martes 22" → "el 22/07 es miércoles").
5. ⏳ P3 lista de espera: activar flag en `/admin` → día lleno →
   [Apúntame ⏰] → cancelar una cita de ese día → llega el aviso.
6. ⏳ P1: huecos con ⭐; apagar el flag en `/servicios` y ver desaparecer las ⭐.

### 10.55 Estado exacto al 3-ago-2026 (retomar por aquí)

**Migraciones que el fundador debe ejecutar (en orden) si no lo ha hecho:**
1. `migration_horarios_cierres.sql` — vacaciones/cierres (¡el log mostró que
   faltaba: `Could not find the table public.store_closures`!).
2. `migration_nombre_perfil.sql` — `customers.name_source` (ya ejecutada).
3. `migration_equipo.sql` — turnos, ausencias y **la migración consciente del
   índice anti doble-reserva**. ⚠️ Leerla entera antes: contiene la vuelta atrás.

**B5 — plan acordado con el fundador (3-ago), decisiones cerradas:**
- Modelo: **personas con NOMBRE** (no un simple contador), porque desbloquea
  turnos individuales, vacaciones por persona, "pido cita con Laura" y la
  reactivación premium.
- **Entrega 1 (hecha, sin probar): personas + turnos + ausencias.** Regla de
  compatibilidad: tienda SIN equipo dado de alta ⇒ comportamiento idéntico al
  actual (una cita a la vez, disponibilidad desde Calendar).
- **Entrega 2 (pendiente): aparatos con unidades.** Un servicio puede exigir
  además un equipo limitado (1 lavacabezas, 2 sillones de color): tabla
  `service_resources` + contar unidades libres. `resources.units` ya existe.
- **Entrega 3 (pendiente): elegir profesional** al reservar ("¿con quién?").
- **Fuera de alcance consciente:** modelar las FASES de un servicio (el tinte
  ocupa a la persona 20 min y luego solo el sillón 30 min). Es lo que hacen
  los sistemas profesionales para exprimir la agenda; se valorará como
  funcionalidad premium, nunca antes de tener pilotos.

**Cómo se calcula ahora la disponibilidad** (importante para no romperlo):
`generate30MinSlots` genera los huecos por horario y duración, y
`equipo.filtrarHuecosPorEquipo()` los filtra dejando solo aquellos con al
menos una persona **de turno, sin ausencia y sin cita solapando**. Está
aplicado en los 6 caminos (flujo guiado, revalidación al elegir hora,
confirmación SI, DISPONIBLE, CITA directa, cambio de cita) y en las citas
manuales del panel. Al confirmar, `equipo.elegirPersonaLibre()` asigna a la
persona con menos carga ese día.

### 10.56 INCIDENTE 4-ago-2026 — la cita borrada en Google Calendar no liberaba el hueco

**Qué pasó:** el fundador borró dos citas directamente en Google Calendar y el
bot siguió considerando esas horas ocupadas.

**Por qué:** una cita vive en dos sitios (BD y Calendar). Hasta B5 la
disponibilidad se leía **solo de Calendar**, así que borrar allí bastaba. Al
introducir el equipo, la ocupación pasó a calcularse **desde `appointments`**
— y nadie estaba mirando si el evento seguía existiendo. Es un efecto
colateral del propio B5, no un fallo de Google.

**Solución (módulo `backend/src/sincronizacion.js`):**
- `eventosDelDia()` sustituye a `listEventsForDay()` en los **7 caminos** de
  disponibilidad: devuelve los mismos eventos y de paso reconcilia el día.
  Coste normal: una consulta a la BD y **cero** llamadas extra a Google.
- `reconciliarTodas()` en el cron de cada 10 min (30 días vista, todas las
  tiendas con calendario), avisando a la lista de espera de cada hueco
  recuperado.
- Botón **↻ Google Calendar** en la Agenda del panel.
- Interruptor `stores.usar_sync_calendar` (migración
  `migration_sync_calendar.sql`) → apagado = comportamiento anterior.

**Regla de diseño que NO se debe relajar:** cancelar es destructivo para la
clienta, así que jamás se cancela por ausencia en un listado; se confirma
evento por evento con `events.get` y solo cuenta un 404/410 o `status:
cancelled`. Ante error de red, no se toca nada. Probado ejecutando la lógica
con dobles (8 reglas, incluidos falsos positivos y Google caído).

**Lección de producto:** cualquier dato que la tienda pueda tocar por fuera de
la app (calendario, teléfono, WhatsApp Web) necesita un camino de vuelta. La
peluquera no va a cambiar su herramienta de siempre.

### 10.70 LA SEMANA DE LOS FALLOS SILENCIOSOS (14→16-ago-2026)

Cinco días de pruebas reales del fundador por WhatsApp. Casi todos los fallos
compartían la misma forma: **el sistema no daba error, hacía otra cosa**. Se
recogen aquí porque el patrón importa más que los arreglos.

**1. Cuatro días desplegando al vacío.** El backend NO se desplegaba desde el
11-ago: un `backend/package-lock.json` con una entrada rota (`fsevents` sin
versión, generado en Linux) hacía fallar `npm install` con «Invalid Version».
Render lo intentó cinco veces, las cinco fallaron, y el servicio seguía
marcado **Live** — con la versión de cuatro días antes. Se arreglaron bugs que
ya estaban arreglados.
· `/health` ahora devuelve `commit` y `arrancado`.
· Las pruebas de GitHub usan `npm ci` (reproduce el build de Render), no
  `npm install`, que es indulgente y repara el lockfile por su cuenta.
· **HAY DOS SERVICIOS EN RENDER** (`app-whatsapp-backend` y `-frontend`) y se
  despliegan por separado. Ver runbook §0.pre.

**2. La IA decidía, no interpretaba.** «Una permanente para el martes» →
propuso reservar un **Corte**, porque el modelo lo había leído dos mensajes
antes y devolvió `servicio:"Corte"`. Como Corte existe en el catálogo, se
aceptó. Ahora su respuesta debe tener **eco** en lo que escribió la clienta
(raíz de 4 letras): «cortarme el pelo»→Corte sí, «permanente»→Corte no. Y para
decir «no tenemos permanente» ya no se depende de la IA: se saca del texto
buscando lo que va tras un artículo (`un/una`), que en castellano nombra cosas
y deja fuera días y nombres propios.

**3. Media implementación, cuatro veces.** El patrón del año:
· El recuerdo del servicio se puso como último recurso para *cualquier* caso
  y se comió la comprobación «eso no lo hacemos».
· Los bloqueos de horas se metieron en 3 de los 4 constructores de caché; el
  que faltaba (`elegirPersonaLibre`) es justo el que reparte la cita, así que
  se comprobaba que Laura estaba bloqueada y el reparto se la asignaba igual.
  → Ahora hay UN constructor, `equipo.cacheDelDia()`, y una prueba que lee el
  fuente y falla si alguien vuelve a escribirlo a mano.
· «Comprobar antes de preguntar» se puso en el botón y no en el texto.
· El mensaje «no puede» estaba escrito en cuatro sitios, uno de ellos mintiendo
  («acaba de quedarse sin ese hueco» cuando llevaba horas bloqueado).
  → Una sola función, `avisarNoPuede()`.

**4. `no-use-before-define`.** `pedida` se usaba 15 líneas antes de su `const`
en la rama de «ese hueco ya no está libre». ReferenceError: la clienta pulsaba
«Sí, resérvala» y no recibía NADA. Y solo fallaba cuando el hueco estaba
ocupado o bloqueado — es decir, **justo cuando la comprobación de seguridad
funcionaba**. `no-undef` no lo ve. Regla añadida a eslint.

**5. Dos citas a la misma hora del mismo teléfono.** Explicaban unos
recordatorios «fantasma» que parecían un fallo del motor. Ahora `citaSolapada()`
lo impide, respetando los bordes (pegar un tinte justo después de un corte es
legítimo). Además: no se confirman citas ya pasadas, y el recordatorio se
**reserva antes de enviarse** para que dos planificadores solapados no lo
manden dos veces.

**Construido esta semana:** bloqueos de horas con «¿a quién afecta?»
(`store_blocks`, panel + motor + rejilla), borrado de servicios sin destrozar
el histórico, «elegir profesional» también al reservar escribiendo, detección
de «con Laura» en texto libre, aviso de zona horaria en Salud (Canarias),
y el día marcado abierto sin horas pasa a cerrado.

**Lección transversal:** cuando una comprobación de seguridad y una comodidad
compiten, gana la comodidad si no se mira. Cada vez que se añade un dato al
motor hay que preguntarse **cuántos caminos lo leen**, no cuántos lo escriben.

### 10.69 EDITORIAL MONOCROMO — Y EL NEOMORFISMO QUE DURÓ UN DÍA (11-ago-2026)

Repaso visual completo del panel y del backoffice. Paleta neutra pura: fuera
los beiges y la tinta cálida.

**Primero se probó neomorfismo** (superficies del color del fondo, separadas
por sombras duales). Bonito en el portátil, **ilegible en un móvil con luz**.
Se retiró el mismo día.

Su defecto es de definición, no de ejecución: si las superficies comparten
color con el fondo, toda la estructura depende de una sombra difusa. Es
literalmente el mismo defecto que la auditoría del 5-ago ya había encontrado
—tarjeta blanca sobre fondo claro, 1,02:1— con otro nombre.

> **Lección:** si la estructura de una pantalla depende de una sombra, se
> pierde con la luz del sol.

**Lo que quedó — editorial monocromo:**

- Lienzo `#f5f5f5`, superficies **blancas**. Se distinguen por tono, no por un
  borde que se pueda perder.
- Estructura por **filetes de 1 px** (`#e8e8e8` divide, `#d9d9d9` delimita) y
  por espacio. En listas, **solo líneas horizontales**: nada de rejillas.
- La acción principal es un **bloque negro** con texto blanco: **18,9:1**.
- Los estados se resuelven **invirtiendo** (el botón secundario se pone negro
  al pasar por encima) o con un gris suavísimo. Sin colores llamativos para
  decir «esto está seleccionado».
- Radios de 8 px. Lo muy redondo es infantil y esto es una herramienta.

**Contraste medido:** principal 18,9:1 · párrafo 10,5:1 · metadato 5,7:1 ·
estados entre 5,9:1 y 7,0:1. Todo por encima del mínimo AA de 4,5:1.

**El color, solo donde significa algo:** verde correcto, ámbar aviso, rojo
error. Si aparece color donde no hay nada que decidir, el sistema está roto.

### 10.68 PARTICIÓN DE index.js — LA RED PRIMERO (10-ago-2026)

Antes de mover una línea se construyó `test/rutas.test.js`: lee la tabla de
rutas REAL de Express y fija que las públicas son exactamente seis.

**El detalle que la hace útil:** baja también dentro de los Router montados.
Sin esa recursión se habría quedado ciega justo al empezar a mover las rutas
—una prueba que deja de ver lo que vigila cuando haces el cambio que vigila no
vigila nada—. Verificada dos veces rompiéndola a propósito: ruta suelta antes
del middleware, y ruta escondida dentro de un Router. Roja las dos veces.

**Terminado: las 52 rutas del panel están fuera.** `routes/admin.js`,
`routes/equipo.js`, `routes/agenda.js` y `routes/tienda.js`. `index.js`:
3.832 → 2.817 líneas (−26%), y lo que queda es lo que le toca — conversación,
webhooks, cron y arranque. Recuento de rutas idéntico en cada paso: 58, con
las mismas 6 públicas.

**Se deshizo el nudo:** `notificarListaEspera` la usaban a la vez el flujo y
las rutas de agenda. Vive en `avisos.js` y la importan las dos. Duplicarla
habría sido peor que no separar.

Durante la extracción, `no-undef` cazó **cinco** dependencias que me dejaba
atrás (`getStoreConfig`, `listBusinessHours`, `equipo`, `sincronizacion`,
`getAppointmentsByDate`…) y `node --check` un `require` duplicado. Ninguna
habría dado la cara hasta que alguien usara esa pantalla.

**La costura elegida no es «rutas contra lógica», es MOTOR contra
CONVERSACIÓN** — porque es la que permite añadir verticales sin tocar el
cálculo de huecos. Receta completa en `docs/16-arquitectura-backend.md`.

Queda un nudo: `notificarListaEspera` la usan el flujo y las rutas de agenda.
Antes de sacar la agenda hay que llevarla a `avisos.js`, no duplicarla.

### 10.67 LOS ERRORES SE VEN (10-ago-2026)

`errores.js` + tabla `system_errors`. Todo lo que revienta —webhook, rutas,
promesas sin gestionar— se apunta AGRUPADO y sale en el bloque de Salud.

Tres reglas innegociables, todas probadas:

1. **`registrarError` nunca lanza.** Un sistema de avisos que tumba la
   petición que vigilaba es peor que no tener avisos.
2. **Nunca guarda datos de clientas.** Teléfonos y correos se tapan antes de
   escribir. Un registro de errores es de las tablas que más gente acaba
   mirando.
3. **Agrupa.** Un fallo repetido 200 veces es UNA línea con `veces = 200`. Un
   buzón inundado es otra forma de no enterarse.

El botón *Visto* silencia, pero si el error vuelve a ocurrir la marca se borra
sola: si ha vuelto, no estaba resuelto.

Con esto se cierra el patrón que veníamos persiguiendo desde el 5 de agosto:
el sistema ya no falla en silencio.

### 10.66 DETECTOR DE VARIABLES INEXISTENTES — DOS BUGS DE PRODUCCIÓN (10-ago-2026)

Al preparar la partición de `index.js` se instaló `eslint` con **una sola
regla**, `no-undef`. Encontró dos fallos vivos desde hacía semanas:

- `fmtHuman` se usaba en `handleFlowPayload` pero estaba definida dentro de
  `handleIncomingText`. **El flujo B5.3 reventaba al pulsar «Con Marta» o
  «Anular la cita»** — la función que se probó el 8 de agosto.
- `profileName` se usaba en `handleWaitlistButton` sin estar en sus
  parámetros. Pulsar «Lo quiero» reventaba igual.

Sintaxis correcta, `node --check` en verde, 69 pruebas en verde. Solo fallaba
cuando una clienta pulsaba ese botón.

**Lección:** ambos son el mismo error de siempre —construir media función, que
el dato no llegue al final— pero esta vez lo encontró una herramienta en
segundos en vez de un cliente en semanas. `npm test` lo ejecuta primero.

### 10.65 AISLAMIENTO MULTITIENDA — VERIFICADO EN EL PANEL (10-ago-2026)

Segunda tienda con su propio usuario, entrando en ventana de **incógnito**
(en la ventana normal sigue viva la sesión de administrador y no se probaría
nada). Resultado: panel completo y **vacío**. Ni una clienta, ni una cita, ni
un servicio de la otra tienda.

Queda verificada la mitad de seguridad: JWT → `store_users` → `store_id`, y
el `?store_id=` del query se ignora para usuarios de tienda.

**Lo que sigue SIN probar** es el rutado del webhook con dos números a la vez.
El código está leído, no ejercitado. Necesita una segunda línea telefónica y
hay que hacerlo antes de la primera peluquería real.

**Aviso de producto:** las tiendas de prueba dejan incidencias permanentes en
`/admin` («WhatsApp sin conectar»). Un panel siempre en rojo por motivos
falsos es un panel que se deja de mirar — y entonces la alarma de verdad no
se ve. Borrar las tiendas ficticias cuando cumplan su función.

### 10.64 B5.5 — SERVICIOS POR PROFESIONAL, PREMIUM (6-ago-2026)

«Es que Borja no hace color.» Tabla `resource_skills` (store/resource/service)
y flag premium `servicios_por_profesional`.

**Una sola regla, deliberadamente idéntica a la de los turnos:**

> Sin ninguna fila = hace TODOS los servicios.
> Con alguna fila = hace SOLO los marcados.

Dos reglas parecidas con comportamientos distintos es como se fabrica un bug
que nadie encuentra. Instalarlo no cambia nada: la tabla nace vacía.

Un punto de filtrado — `equipo.disponibilidadEnRango`, paso 0 — del que
cuelgan solos los huecos, el reparto automático, `puedeAtender` y por tanto el
barrido B5.3. `listarElegibles(storeId, serviceId)` además esconde de la lista
de WhatsApp a quien no hace ese servicio: enseñarla sería peor, la clienta la
elige y no encuentra ni un hueco.

**La red de seguridad es lo importante.** El riesgo no es marcar de más, es
dejar un servicio sin nadie: el asistente dejaría de ofrecerlo EN SILENCIO.
`serviciosSinNadie()` lo detecta y el panel lo enseña en rojo, arriba y
permanente, hasta que se arregla.

Tabla aparte de `service_resources` a conciencia: mismas dos columnas,
significado opuesto («este servicio NECESITA este aparato» vs «esta persona
SABE hacer este servicio»).

### 10.63 BUG — «SIN TURNOS = TRABAJA SIEMPRE» SE APLICABA AL DÍA (6-ago-2026)

`disponibilidadEnRango` filtraba `turnos.filter(t => t.resource === p.id && t.weekday === hoy)`
y, si no encontraba fila, se saltaba la comprobación entera. Traducción: quien
tenía horario propio quedaba **libre todos los días que no tiene turno**. Marta,
con turno solo los martes, salía disponible el resto de la semana.

El mismo criterio estaba **duplicado en `frontend/lib/rejilla.ts`**, así que la
pantalla confirmaba el error en vez de delatarlo.

Corregido: la regla se aplica **a la persona, no al día**. Con algún turno
declarado, los días que no aparecen los libra.

**Lección (la tercera del mismo tipo):** un default tolerante puesto en el
sitio equivocado no da error, da permiso. Y una regla replicada en dos
lenguajes es una regla que se corrige a medias.

### 10.62 LIMITACIONES CONOCIDAS — doc 13 (6-ago-2026)

`docs/13-guia-configuracion-tienda.md` es **el documento que se entrega a la
peluquería**: configuración paso a paso, día a día, y una sección entera de
«lo que NO hace». Estaba todo repartido entre esta visión, el runbook y
conversaciones sueltas — y una limitación que la dueña no puede leer es una
limitación que no existe hasta que le explota en la cara un sábado.

**REGLA: cuando se descubra una limitación nueva, va al doc 13 el mismo día.**
Las principales hoy:

1. Un evento escrito a mano en Google Calendar consume UNA plaza del equipo
   pero no se asigna a nadie → con «elegir profesional» el bot puede ofrecer
   justo a quien está ocupado. Se arregla del todo con un calendario por
   profesional (cambio de arquitectura, no antes del piloto).
2. ~~Todas las profesionales hacen todos los servicios~~ → resuelto en B5.5
   (§10.64) como premium `servicios_por_profesional`. Sin contratar, sigue
   siendo cierto.
3. Aparatos y tramos no limitan hasta que se marcan servicio por servicio.
4. Ventana de 24 h de Meta para escribir libremente.
5. Arranque en frío de Render: 30-60 s la primera consulta del día.
6. Detección de citas huérfanas: hasta 10 minutos, no instantánea.

### 10.61 B5.3 — ELEGIR PROFESIONAL, funcionalidad PREMIUM (5-ago-2026)

**Cómo se activa (y cómo se activará con el pago):** flag premium
`elegir_profesional` en `stores.premium_features`. Hoy lo enciende el admin
desde `/admin`; la tienda puede apagarlo desde «Mi plan». **El día que haya
cobro, el webhook de Stripe solo tiene que llamar a la MISMA función**
(`admin.updateStoreFeatures`) — no hay una segunda vía de activación, a
propósito. Sin contratar, el bot no pregunta y todo funciona como antes.

**El flujo:** tras elegir servicio, si hay ≥2 personas elegibles se ofrece una
lista con «Me da igual» **la primera** (es lo que responde la mayoría) y los
nombres detrás. A partir de ahí, los huecos que se enseñan son SOLO los de esa
persona (`filtrarHuecosPorEquipo(..., resourceId)`), y la confirmación dice con
quién queda la cita.

**Lo que hacía falta modelar y no existía** (`migration_elegir_profesional.sql`):
- `appointments.resource_pedido` — distingue «se lo asignamos» de «lo pidió
  ella». Sin esto no se puede decidir nada sin pisar preferencias.
- `appointments.aviso_profesional_at` — el barrido corre cada 10 min; sin esta
  marca la clienta recibiría el mismo WhatsApp seis veces por hora.
- `resources.elegible` — la dueña atiende pero no quiere salir en la lista.

**AGUJERO PREEXISTENTE QUE ESTO CIERRA:** si una profesional se iba de
vacaciones, sus citas seguían asignadas a ella y **nadie avisaba a nadie**. No
se notaba porque el reparto era automático y cualquiera atendía. En cuanto la
clienta elige, deja de valer. `profesional.revisarTodas()` (en el cron) hace:

- persona asignada por nosotros y hay alguien libre → **reasigna en silencio**
  (la clienta pidió hora, no persona);
- persona **pedida** por la clienta, o nadie libre → **le escribe con tres
  salidas**: otra profesional a la misma hora, otro hueco con la suya, o
  anular. Y si no queda nadie libre, solo se le ofrecen dos: proponer algo
  imposible es peor que no proponer nada.

Ante un error de lectura NO se toca la cita: mover o avisar por un fallo
transitorio sería peor que no hacer nada. Probado ejecutando la lógica con
dobles (9 reglas: reasignación silenciosa, respeto a la preferencia, tres
salidas, dos cuando no hay nadie, no repetir aviso, tienda sin equipo).

**Decisiones conscientes que quedan fuera:** qué servicios sabe hacer cada
persona (hoy todas hacen todo). Cuando una peluquería lo pida, es otra tabla y
otra pantalla — y otro sitio donde la dueña puede olvidarse de marcar algo y
quedarse sin huecos.

### 10.60 AUDITORÍA DE DISEÑO Y ACCESIBILIDAD (5-ago-2026)

Revisión de las seis pantallas del panel por los cuatro ejes (tipografía,
color, disposición, claridad). Lo corregido, con el porqué:

1. **Escala tipográfica.** Había **trece tamaños** en uso y la jerarquía
   estaba invertida: los títulos de sección (15 px) eran más pequeños que el
   cuerpo (16 px). Ahora seis pasos (28/18/15/13/12 + cifras) y **dos pesos**
   (400 y 500). El `font-semibold` se ha eliminado del proyecto.
2. **Contraste — esto era accesibilidad, no gusto.** Los metadatos iban en
   `#8a8378` (3,6:1) y las horas de la rejilla en `#a8a29e` (2,6:1), ambos por
   debajo del mínimo AA de 4,5:1 y a 11 px. Ahora `#6b6459` (5,9:1) y
   `#57534e` (7,5:1). Se han eliminado también **las versalitas pequeñas**:
   11 px + mayúsculas + gris flojo era el texto menos legible del panel.
3. **Superficies.** Tarjeta blanca sobre fondo `#faf9f6` daba 1,02:1 — la
   estructura dependía de un borde casi invisible y se perdía con sol. Fondo
   a `#f4f2ec` y borde a `#ddd9d0`. Los bloques de cita de la rejilla
   (`#f4f1ec` sobre blanco, 1,05:1) llevan ahora **filo de tinta** a la
   izquierda: en una agenda, ocupado-vs-libre es la distinción número uno.
4. **Dedo.** Los botones compactos medían 27 px de alto. Mínimo 44 px (36 los
   compactos). Es una peluquería: manos mojadas, laca, prisa.
5. **Botón destructivo.** En Equipo, `Borrar` era el PRIMERO de la fila y con
   el mismo peso que los demás. Ahora va el último, separado por un filete y
   **apagado**: solo enseña color al pasar por encima. Un botón rojo
   permanente invita a pulsarlo.
6. **Mensajes internos fuera del panel.** El histórico enseñaba cadenas de
   registro (`[lista] Huecos de «Mechas»…`, `[botones] …`). Reescritas como
   conversación: la tabla `messages` es el historial que lee la tienda. Y las
   conversaciones muestran el **nombre** de la clienta, no su teléfono.
7. **Inicio rediseñado.** Tres cifras sin acción («30 mensajes recientes») se
   sustituyen por un bloque en tinta con **lo siguiente** que toca y dos
   datos que piden decisión: citas de hoy y **sin confirmar**. Fuera el botón
   «Actualizar», que era pensamiento de programador.
8. **Nomenclatura.** *Servicios* significaba dos cosas: el catálogo de la
   peluquería y las funciones premium de CanalAgenda. Ahora **Catálogo** y
   **Mi plan** (que habla de *funciones*, no de servicios).
9. **Honestidad de catálogo.** Las cinco funciones premium diseñadas pero NO
   construidas se marcan **«Próximamente»**. Ofrecerlas como contratables era
   vender humo, y contratarlas no habría hecho nada.

**Regla que queda:** ningún texto por debajo de 12 px, ningún gris por debajo
de 4,5:1, ningún control por debajo de 36 px, y el acento solo en LA acción.

### 10.59 SISTEMA VISUAL «editorial cálida» + rejilla de agenda (5-ago-2026)

**Por qué se cambió:** el panel usaba verde `#0f7a4f` en títulos, botones,
badges y horas a la vez. Un color que lo tiñe todo deja de señalar nada.

**Sistema nuevo** (`frontend/app/globals.css`): tinta cálida `#1c1917` sobre
fondo hueso `#faf9f6`, **un único acento terracota `#c2410c`** y tipografía
Instrument Serif (solo titulares y marca) + Instrument Sans (todo lo demás),
cargadas con `next/font` — se sirven desde nuestro dominio, sin peticiones del
navegador de la clienta a Google.

**REGLA DEL ACENTO, no negociable:** el terracota significa «esta es LA acción
o el dato que exige actuar». Navegación activa, títulos y datos van en tinta.
Si el acento vuelve a aparecer en cinco sitios de una pantalla, se ha roto el
sistema.

**Referencias estudiadas:** Fresha (disciplina y contención), GlossGenius
(el rayado diagonal y la línea de «ahora»), Phorest (*Staff / Rooms /
Machines* — valida nuestro modelo de aparatos). Descartados a conciencia:
glassmorphism (pierde contraste con sol, envejece mal y castiga móviles
viejos), un color por servicio (agotador ocho horas seguidas), temas por salón
y fotos de clienta en las tarjetas.

**Rejilla de agenda** (`components/RejillaAgenda.tsx` + `lib/rejilla.ts`):
columna por profesional, tiempo en vertical, y dos ideas que valen más que
todo lo estético:
1. **Lo que no se puede vender se ve rayado** — fuera de turno, vacaciones y
   ratos bloqueados con la misma trama. La pregunta «¿por qué no ofrece esa
   hora?» se responde mirando, sin soporte.
2. **Las citas con fases se pintan HUECAS** — el bloque ocupa el sillón dos
   horas y media y enseña dentro la banda libre. Eso no lo tiene ninguno de
   los tres competidores estudiados.

La aritmética vive aparte en `lib/rejilla.ts` **precisamente para poder
ejecutarla**: un error de minutos no da ningún error, solo pinta una cita en
la hora equivocada. 14 reglas probadas, incluida la más delicada — *sin turnos
declarados, disponible todo el día*, igual que el motor. Si la pantalla y el
motor discrepasen, la peluquera dejaría de fiarse de su agenda.

La vista (rejilla o lista) se recuerda en `localStorage`: un salón de una sola
persona vive mejor con la lista.

### 10.58 B5.4 — FASES DEL SERVICIO (4-ago-2026)

Lo que estaba marcado como "fuera de alcance consciente" en §10.55 ya está
construido, porque sin ello la agenda de una peluquería es falsa: un tinte
bloqueaba 90 min de peluquera cuando solo la ocupa 45.

**Modelo (3 tramos por servicio, editables en el panel):**
`trabajo_inicial_min` · `espera_min` · `trabajo_final_min`, que deben sumar
`duration_minutes`. Con `espera_min = 0` el servicio es de trabajo continuo y
todo se comporta como antes — es el valor por defecto.

**Dos ocupaciones distintas, y esto es la clave:**
- el **puesto/aparato** se ocupa el rango entero (la clienta está sentada),
- la **persona** solo en sus tramos activos (`equipo.tramosActivos`).

Así, mientras reposa el tinte de Marta, el bot puede venderle a otra clienta
un corte en ese hueco; y si solo hay un sillón de color, sigue siendo
imposible meter un segundo tinte (lo impide B5.2, no B5.1).

**Es PREMIUM (decisión comercial del 4-ago):** flag `fases_servicio`. El admin
la contrata tienda a tienda desde `/admin`; la tienda puede apagarla en «Mi
plan». No hay un segundo interruptor propio a propósito: dos switches para lo
mismo acaban contradiciéndose. Sin contratar, `equipo.usarFases()` devuelve
false y todo se comporta como antes; los minutos configurados en cada servicio
se conservan por si se contrata más adelante. La recomendación de esos huecos
(⭐), cuando se construya, irá bajo ESTE mismo flag — no uno nuevo.

**Margen de seguridad** `stores.margen_relleno_min` (5 min por defecto): solo
ensancha los tramos de las citas que TIENEN fases, para que encadenar dos
cortes normales siga siendo posible.

**Cambio delicado asociado:** cuando la tienda gestiona equipo,
`sincronizacion.filtrarEventosPropios()` quita de la lista de Google Calendar
las citas propias con profesional asignada, porque las modelamos con mucha más
precisión que un bloque opaco. Se conservan siempre los eventos ajenos y las
citas SIN profesional (si no, nadie las filtraría). La lista completa viaja
igualmente como propiedad `todos` para no romper la puntuación ⭐ de P1.

Verificado ejecutando la lógica (13 reglas) con un salón de una sola peluquera:
el corte cabe en el reposo, no cabe si pisa el aplicado, el lavado o el margen,
y si Marta libra a las 12:00 no se le asigna un tinte que hay que lavar a esa
hora.

### 10.57 INCIDENTE 4-ago-2026 — la rejilla de huecos perdía dinero

**Qué pasó:** para Mechas (150 min) un sábado de 10:00 a 14:00 el bot ofrecía
**una sola hora**, las 10:00.

**Por qué:** `generateSlots` avanzaba el cursor la duración entera del servicio
(`cursor = slotEnd`), así que solo existían bloques 10:00→12:30 y 12:30→15:00;
el segundo no cabía. **11:30→14:00 estaba libre y no se ofrecía jamás.** El
mismo efecto explicaba los tintes ofrecidos solo cada 2 h.

**Solución:** `stepMinutes` separa *cada cuánto puede empezar* una cita de
*cuánto dura*. Por defecto 30 min, configurable por tienda en Horarios
(15/30/60 o `0` = bloques, comportamiento anterior). Columna
`stores.paso_huecos_min` (`migration_paso_huecos.sql`), leída con
`equipo.pasoHuecos()` en los 7 caminos de disponibilidad.

Verificado ejecutando `generateSlots` con el caso real: sábado 10-14 con 2h30
→ `10:00 10:30 11:00 11:30`; en bloques → `10:00`; y ningún hueco termina
después del cierre ni solapa con una cita cuando la capacidad es 1.

**Lección:** un fallo que no da error y solo *ofrece de menos* es el más caro
de todos, porque nadie lo denuncia — la clienta se va y la tienda no se entera.
Al probar disponibilidad hay que contar los huecos esperados a mano, no
limitarse a comprobar que "sale algo".

### 10.6 INCIDENTE 28-jul-2026 — el planificador estaba muerto
El cron de cron-job.org se había **autodesactivado** tras errores HTTP
repetidos: semanas sin recordatorios ni despacho, **sin ningún error visible**
(nadie llamaba al backend). Se detectó al probar R1. Arreglado reactivándolo,
y se añadió un **segundo despachador redundante en GitHub Actions**
(`.github/workflows/cron-despachador.yml`, requiere el secreto
`INTERNAL_CRON_TOKEN` en GitHub). Detalle y comprobación rápida en
`docs/runbook-incidencias.md` §5.0. **Lección:** lo que no se vigila, se cae
en silencio — antes de vender, `/admin` debe mostrar "última ejecución del
cron: hace X min" (pendiente).
