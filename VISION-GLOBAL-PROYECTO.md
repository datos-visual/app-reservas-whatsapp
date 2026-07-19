# CanalAgenda — Visión global del proyecto

> **Propósito de este documento:** dar a cualquier persona (o conversación de IA)
> el contexto completo del proyecto: qué es, por qué existe, cómo está construido,
> qué está hecho y verificado, y qué queda. Actualizado: **17 de julio de 2026**.
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

### 7.5 Fase 2 técnica (cuando el negocio valide)
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

### 10.5 Pruebas reales pendientes al cierre del 17-jul
1. B3: `mis citas` → tocar cita → [Cambiar|Cancelar|Nada] → cancelar con Sí/No.
2. Aviso de fecha: "el martes 22 de julio" → "el 22/07 cae en miércoles".
3. P3: activar flag waitlist en `/admin` → día lleno → [Apúntame ⏰] →
   cancelar una cita de ese día desde otro número → llega el aviso.
4. R1 recordatorio: cita a ~5 h vista → en ≤15 min plantilla con botones
   [Confirmo]/[Cancelar cita] (NUNCA probado en real todavía).
5. P1: huecos con ⭐ y leyenda; apagar el flag en `/servicios` y ver
   desaparecer las ⭐ (circuito comercial completo).
