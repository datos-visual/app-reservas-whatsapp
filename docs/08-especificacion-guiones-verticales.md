# 08 — Especificación técnica: flujo guiado y guiones verticales (peluquería y taller)

> **Para la conversación de desarrollo.** Este documento convierte los guiones del
> `ESTUDIO-DISENO-WHATSAPP-CANALAGENDA.docx` en especificación implementable:
> estados, payloads de botones, cambios de BD, plantillas de Meta listas para
> aprobar y orden de desarrollo por bloques con su Definition of Done.
> Complementa (no sustituye) `INSTRUCCIONES-PROYECTO.md` — ante conflicto, INSTRUCCIONES manda.
> Actualizado: 10 de julio de 2026.

---

## 0. Objetivo y alcance

Sustituir el flujo por comandos (`DISPONIBLE YYYY-MM-DD`, `CITA fecha hora`) por un
**flujo guiado con botones y listas interactivas**, con catálogo de servicios por
vertical y recordatorios anti no-show. Verticales de esta fase: **peluquería** y
**taller mecánico** (modelo A: cita con duración). Quedan FUERA de esta fase:
cupos por clase (gimnasio/restaurante), estancias (rural), pagos/señas, NLU con LLM
y multi-recurso completo (se deja preparado el modelo de datos).

**Reglas inviolables que aplican a todo el documento** (resumen de INSTRUCCIONES):

1. Todo por `store_id`; jamás llega del exterior (webhook → `phone_number_id` → tienda).
2. No romper idempotencia de mensajes ni el índice anti doble-reserva.
3. Backend stateless: TODO el estado conversacional en `conversation_state`.
4. Webhook = 200 rápido + proceso en background (`setImmediate`).
5. luxon con timezone por tienda; logs `[Modulo]` en español; migraciones SQL
   idempotentes + actualizar `schema_consolidated.sql`.
6. Regla de costes: los mensajes interactivos son respuestas de servicio (gratis
   en ventana 24 h); solo las plantillas de la sección 7 cuestan dinero y van
   con cupo.
7. **Compatibilidad:** los comandos de texto actuales SIGUEN funcionando. El flujo
   guiado se añade; no se elimina nada hasta validar con pilotos.

---

## 1. Arquitectura del flujo guiado

### 1.1 Estado conversacional

Se reutiliza `conversation_state (store_id, phone, state jsonb, expires_at)`.
Nueva forma del JSONB (conviven las claves antiguas; `pendingAppointment` se
mantiene para el flujo de comandos):

```jsonc
{
  "flow": {
    "name": "reserva",            // reserva | cancelar | miscitas
    "step": "SELECT_SLOT",        // estado actual (sección 3)
    "vertical": "peluqueria",     // stores.vertical_code
    "data": {
      "serviceId": 12,            // services.id elegido
      "serviceName": "Tinte",
      "durationMinutes": 120,
      "resourceId": 3,            // opcional (empleado/elevador); null = cualquiera
      "dateIso": "2026-07-16",    // fecha elegida
      "startIso": null,           // hueco elegido (ISO con zona)
      "endIso": null,
      "extra": {                  // datos del vertical
        "matricula": "4587KLM",
        "averia": "ruido al frenar en frío"
      }
    }
  }
}
```

- `expires_at`: **10 min** desde la última interacción (igual que hoy). Al expirar,
  el hueco NO está bloqueado (el bloqueo real solo existe entre CONFIRM y el insert,
  como hoy: revalidación + índice único). Si el cliente vuelve con flujo expirado →
  mensaje «Retomamos: ¿qué necesitas?» + menú.
- Cada handler lee el estado, decide, **escribe el estado nuevo y responde**. Nunca
  hay estado en memoria.

### 1.2 Convención de payloads (namespace propio)

Todos los botones/listas del flujo guiado usan ids con prefijo `ca:` para no
colisionar con `BUTTON_PAYLOADS` del módulo missed-call (que se respetan tal cual):

```
ca:<flujo>:<accion>[:<arg>]
```

| Payload | Emisor | Significado |
|---|---|---|
| `ca:menu:reservar` | botón menú | iniciar flujo de reserva |
| `ca:menu:miscitas` | botón menú | listar citas futuras |
| `ca:menu:humano` | botón menú | traspaso a humano |
| `ca:res:svc:<service_id>` | lista servicios | servicio elegido |
| `ca:res:rsc:<resource_id\|any>` | lista recursos | empleado/recurso elegido (`any` = cualquiera) |
| `ca:res:day:<YYYY-MM-DD>` | botones fecha | día elegido (hoy/mañana calculados con luxon en la zona de la tienda) |
| `ca:res:day:otro` | botón fecha | pedir fecha por texto (fase Flows: DatePicker) |
| `ca:res:slot:<HHmm>` | lista huecos | hueco elegido (fecha ya está en `data.dateIso`) |
| `ca:res:confirm` / `ca:res:back` / `ca:res:cancel` | botones resumen | confirmar / cambiar hora / cancelar flujo |
| `ca:apt:cancel:<appointment_id>` | lista mis citas / recordatorio | cancelar cita concreta |
| `ca:apt:change:<appointment_id>` | recordatorio | recolocar cita (salta a SELECT_DATE conservando servicio) |
| `ca:apt:confirm:<appointment_id>` | recordatorio | confirmación de asistencia |
| `ca:pick:ready:<hoy\|manana>` | plantilla coche listo | recogida del vehículo |

Límite de Meta: id de botón ≤ 256 chars, id de fila de lista ≤ 200 → sobra.
**Regla de seguridad:** el `appointment_id`/`service_id` del payload se valida
SIEMPRE contra `store_id` resuelto por webhook antes de tocar nada (nunca se
confía en el payload; mismo principio que `?store_id=`).

### 1.3 Router de entrada (modificación de `processWebhookBody` / `handleIncomingText`)

Orden de resolución de cada mensaje entrante:

1. `kind === 'button'` con payload `BUTTON_PAYLOADS.*` → `handleMissedCallButton` (sin cambios).
2. `kind === 'button'` con payload `ca:*` → **nuevo `handleFlowPayload`** (router por prefijo).
3. Texto que casa con comandos actuales (`disponible`, `cita`, `si/no` con
   `pendingAppointment`, `baja`, `ayuda`) → flujo actual (sin cambios).
4. Texto nuevo reconocido: `cancelar` → flujo cancelar; `mis citas` → mis citas.
5. Cualquier otro texto:
   - si hay `flow` activo y el paso espera texto (p. ej. `EXTRA_MATRICULA`) → tratar como respuesta del paso;
   - si hay `flow` activo y el paso espera botón → repetir el mensaje interactivo del paso («Elige una opción de la lista 👇»);
   - si no hay flujo → **menú de bienvenida** (sustituye al actual «Gracias por tu mensaje…»).

### 1.4 Nuevos senders en `whatsappCloud.js`

```js
// Botones nativos (máx. 3). buttons = [{ id: 'ca:...', title: 'Confirmar ✓' }]  (title ≤ 20 chars)
async function sendInteractiveButtons({ phoneNumberId, accessToken, to, bodyText, buttons, footerText })

// Lista nativa (máx. 10 filas). sections = [{ title, rows: [{ id, title, description }] }]
// title fila ≤ 24 chars, description ≤ 72 chars
async function sendInteractiveList({ phoneNumberId, accessToken, to, bodyText, buttonText, sections, footerText })
```

Payloads Graph API (`type: "interactive"`, `interactive.type: "button" | "list"`),
misma URL/versión/manejo de errores/logs que `sendTextMessage`. El extractor de
entrada **ya soporta** `button_reply`/`list_reply` — no tocar.
En `index.js`, `sendAndLog` se generaliza: `sendAndLog({ ..., send: () => sendInteractiveList(...) , logBody: 'texto resumen para messages' })`
o variante equivalente — el rate-limit diario y el log en `messages` aplican igual a los interactivos.

---

## 2. Modelo de datos (migración `migration_catalogo_servicios.sql`, idempotente)

```sql
-- 1) Vertical de la tienda
alter table public.stores add column if not exists vertical_code text; -- 'peluqueria' | 'taller' | null (genérico)

-- 2) Catálogo de servicios por tienda
create table if not exists public.services (
  id                bigint generated by default as identity primary key,
  store_id          uuid not null references public.stores(id) on delete cascade,
  name              text not null,
  duration_minutes  integer not null check (duration_minutes > 0),
  price_eur         numeric(8,2),            -- null = no mostrar precio
  description       text,                    -- para la fila de la lista (≤ 72 chars)
  mode              text not null default 'slot' check (mode in ('slot','franja')), -- taller: franja = medio día
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists services_store_active_idx on public.services (store_id, is_active, sort_order);

-- 3) Recursos (empleado / elevador / sala). Fase 1: opcional, una tienda puede no tener ninguno
create table if not exists public.resources (
  id          bigint generated by default as identity primary key,
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null,               -- 'Loli', 'Marta', 'Elevador 1'
  kind        text not null default 'empleado' check (kind in ('empleado','elevador','sala','otro')),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists resources_store_active_idx on public.resources (store_id, is_active, sort_order);

-- 4) Citas: servicio, recurso y datos del vertical
alter table public.appointments add column if not exists service_id  bigint references public.services(id)  on delete set null;
alter table public.appointments add column if not exists resource_id bigint references public.resources(id) on delete set null;
alter table public.appointments add column if not exists extra       jsonb; -- {matricula, averia, ...}

-- 5) Recordatorios (dedupe por cita y tipo — patrón 23505, como missed_call_sends)
create table if not exists public.appointment_reminders (
  appointment_id  bigint not null references public.appointments(id) on delete cascade,
  kind            text not null check (kind in ('24h','2h','resena','recompra')),
  status          text not null default 'pending' check (status in ('pending','sent','skipped')),
  skip_reason     text,
  scheduled_at    timestamptz not null,     -- cuándo debe salir (start_at - intervalo, en UTC)
  sent_at         timestamptz,
  wa_message_id   text,
  created_at      timestamptz not null default now(),
  primary key (appointment_id, kind)
);
create index if not exists appointment_reminders_due_idx
  on public.appointment_reminders (scheduled_at) where status = 'pending';

alter table public.services               enable row level security;
alter table public.resources              enable row level security;
alter table public.appointment_reminders  enable row level security;
```

**⚠️ Anti doble-reserva y multi-recurso.** El índice actual
`(store_id, start_at) WHERE status='confirmed'` implica **una sola cita simultánea
por tienda**. En esta fase se MANTIENE (una tienda de pilotos = un profesional).
Cuando se active multi-recurso real (dos empleados a la vez), migración aparte y
consciente: crear `appointments_store_resource_start_confirmed_unique (store_id,
resource_id, start_at) WHERE status='confirmed' AND resource_id IS NOT NULL`,
mantener el índice viejo solo para filas con `resource_id IS NULL`, y probar la
carrera con test antes de desplegar. **No hacerlo de pasada.**

**Huecos con duración variable.** `generate30MinSlots` (calendar.js) se
generaliza: `slotDurationMinutes` pasa a ser la duración del **servicio elegido**
(`services.duration_minutes`), no la de la tienda. `stores.appointment_duration_minutes`
queda como valor por defecto para tiendas sin catálogo. El paso de rejilla (cada
cuánto empieza un hueco) sigue siendo 30 min salvo que el servicio dure menos.

---

## 3. Máquina de estados del flujo `reserva`

| Estado (`flow.step`) | Mensaje que emite | Espera | Transición |
|---|---|---|---|
| `MENU` | Bienvenida + botones [Reservar cita] [Mis citas] [Hablar con el negocio] | botón | `ca:menu:reservar` → SELECT_SERVICE · `ca:menu:miscitas` → MIS_CITAS · `ca:menu:humano` → HUMANO |
| `SELECT_SERVICE` | Lista de `services` activos (nombre — duración · precio en description) | fila lista | `ca:res:svc:<id>` → (si hay `resources` activos) SELECT_RESOURCE; si no → SELECT_DATE |
| `SELECT_RESOURCE` | Lista: fila 1 «El primero que pueda» (`any`) + recursos activos | fila lista | `ca:res:rsc:*` → SELECT_DATE |
| `SELECT_DATE` | Botones [Hoy] [Mañana] [Otro día] (hoy/mañana con luxon en zona tienda; si hoy ya no quedan huecos, no ofrecer Hoy) | botón o texto fecha | `ca:res:day:<iso>` → SELECT_SLOT · `otro` → pedir texto «dime el día (ej.: 16/07 o martes)» y parsear dd/MM y YYYY-MM-DD |
| `SELECT_SLOT` | Lista de huecos del día para la duración del servicio, agrupados en secciones Mañana/Tarde (máx. 10 filas; si hay más, las 10 primeras + «Ver más tarde» como fila `ca:res:day:<iso>+turno`) | fila lista | `ca:res:slot:<HHmm>` → EXTRA_* (taller) o CONFIRM (peluquería). Si el día no tiene huecos → mensaje con 3 días alternativos como botones |
| `EXTRA_AVERIA` (taller, solo servicio Diagnóstico) | «Cuéntame brevemente qué le pasa» | texto libre | guarda en `extra.averia` → EXTRA_MATRICULA |
| `EXTRA_MATRICULA` (taller) | «¿Matrícula del vehículo? (ej.: 1234 BCD)» | texto | regex `^\d{4}\s?[B-DF-HJ-NP-TV-Z]{3}$` (normalizar sin espacio, mayúsculas). 2 fallos → aceptar tal cual en `extra.matricula_raw` y seguir → CONFIRM |
| `CONFIRM` | Resumen completo (servicio, fecha larga es-ES con luxon, hora, duración, precio, recurso, extras) + botones [Confirmar ✓] [Cambiar hora] [Cancelar] | botón | `confirm` → INSERT (ver 3.1) · `back` → SELECT_SLOT · `cancel` → borrar estado + despedida |
| `DONE` | «Cita confirmada …» + (si procede) «Te recordaremos el día antes» | — | borrar `flow` del estado |

### 3.1 Confirmación (reutiliza el circuito probado de `SI`)

La rama `ca:res:confirm` ejecuta EXACTAMENTE la secuencia actual del comando SI:
revalidar horario del día → regenerar huecos → comprobar que el hueco sigue →
`createOrGetCustomer` → `createCalendarEvent` → `createAppointment` (ahora con
`service_id`, `resource_id`, `extra`; el `summary` del evento pasa a
`"<Servicio> — <teléfono>"` y la descripción incluye matrícula/avería) →
captura `23505` → rollback del evento → «Ese hueco acaba de reservarse…» +
volver a SELECT_SLOT con huecos frescos. Tras el insert: crear filas en
`appointment_reminders` (`24h` y `2h`, con `scheduled_at = start_at - intervalo`;
si ya quedan menos de 24 h/2 h, no crear esa fila) y `attributeBooking` como hoy.

### 3.2 Flujos `miscitas` y `cancelar`

- `MIS_CITAS`: query citas `status='confirmed'` y `start_at > now()` del
  `customer` (por store_id + phone), máx. 5. Sin citas → «No tienes citas
  pendientes» + menú. Con citas → lista interactiva, una fila por cita
  (`ca:apt:cancel:<id>` con title «Cancelar — jue 16, 16:00»). *(Fase 2: fila de
  cambiar además de cancelar.)*
- `CANCELAR` (`ca:apt:cancel:<id>` o texto «cancelar» con 1 sola cita futura):
  validar que la cita pertenece a store_id + phone → botones
  [Sí, cancelar] (`ca:apt:cancelok:<id>`) [No, la mantengo] → al confirmar:
  `status='cancelled'`, `deleteCalendarEvent`, marcar reminders pendientes
  como `skipped('cancelled')`, responder «Cita cancelada. ¿Quieres otra fecha?
  [Reservar]». El hueco queda rereservable (el índice parcial lo permite — bug
  histórico ya corregido, no regresionar).
- `ca:apt:change:<id>` (desde recordatorio): cancela la cita original SOLO al
  confirmar la nueva (orden: reservar nueva → cancelar vieja; si la nueva falla,
  la vieja sigue viva). Implementar como flujo `reserva` con
  `data.replacesAppointmentId`.

---

## 4. Paquetes verticales (seed de configuración)

Seed idempotente en la migración (o script aparte `scripts/seed_verticales.sql`).
El onboarding (paso «crea tu tienda») añade un select de vertical que copia el
catálogo tipo a `services` para que el dueño lo edite.

### 4.1 Peluquería (`vertical_code='peluqueria'`)

| Servicio | Duración | Precio orient. | mode |
|---|---|---|---|
| Corte | 30 | 15 € | slot |
| Corte + lavado | 45 | 19 € | slot |
| Tinte | 120 | 45 € | slot |
| Mechas | 150 | 60 € | slot |
| Peinado evento | 45 | 25 € | slot |
| Barba | 15 | 8 € | slot |
| Tratamiento keratina | 90 | 50 € | slot |
| Otro / no lo sé | 30 | — | slot → HUMANO con nota |

Textos: tono cálido, emojis moderados (los del estudio §4.2). Recursos = empleados.

### 4.2 Taller (`vertical_code='taller'`)

| Servicio | Duración | mode | Extra |
|---|---|---|---|
| Pre-ITV + gestión ITV | 240 | franja | matrícula |
| Revisión / mantenimiento | 480 | franja | matrícula |
| Cambio de aceite y filtros | 60 | slot | matrícula |
| Neumáticos | 45 | slot | matrícula |
| Frenos | 120 | slot | matrícula |
| Diagnóstico de avería | 60 | slot | avería + matrícula |
| Aire acondicionado | 60 | slot | matrícula |
| Otro / presupuesto | 30 | slot → HUMANO (pedir foto) | — |

`mode='franja'`: en SELECT_SLOT no se listan horas, sino franjas de entrega
calculadas del horario del día (p. ej. «Mañana 8:00-9:30», «Mediodía 13:00-14:00»);
la cita ocupa la franja completa en Calendar. Textos: sobrios, sin emojis.
Rama urgencia: si el texto libre contiene «no arranca|grúa|grua|accidente» →
responder teléfono del negocio (stores.business_phone) sin intentar agendar.

---

## 5. Recordatorios anti no-show (motor)

- **Despachador:** se cuelga del endpoint existente `/internal/missed-calls/dispatch`
  (mismo cron de 15 min, mismo token interno; renombrar mentalmente a «cron de
  tareas», la ruta no cambia para no tocar cron-job.org). Añade:
  `SELECT ... FROM appointment_reminders WHERE status='pending' AND scheduled_at <= now() LIMIT 50`
  (join a appointments para descartar `status != 'confirmed'` → skipped('cancelled')).
- **Envío:** cliente CON ventana de 24 h abierta → mensaje interactivo normal
  (gratis). Sin ventana → `sendTemplateMessage` con la plantilla de la sección 7
  (los recordatorios casi siempre van fuera de ventana: asumir plantilla).
- **Comprobaciones en orden anti-coste** (calcadas del missed-call): cita sigue
  confirmada → plantilla aprobada → no opt-out → horario silencioso (encolar:
  no marcar sent, dejar pending) → cupo mensual de plantillas de la tienda →
  cuenta WhatsApp activa → enviar → `sent` + `wa_message_id`.
- **Botones del recordatorio** → payloads `ca:apt:confirm|change|cancel:<id>`
  ya cubiertos por el router (§1.2). `confirm` marca `extra.confirmed_by_client=true`
  en la cita (métrica futura de no-show).
- **Cupo:** columna `monthly_template_quota integer default 300` en… decisión:
  nueva tabla `store_messaging_settings` NO — reutilizar patrón: añadir columna a
  `stores` (simple, Fase 1). Contador = count de reminders `sent` del mes + envíos
  missed-call del mes (consulta, sin tabla nueva).

---

## 6. API del panel (nuevas rutas, todas tras `authMiddleware` + `requireStoreId`)

| Ruta | Método | Descripción |
|---|---|---|
| `/api/services` | GET / POST | listar / crear servicio (whitelist de campos, como missed-call settings) |
| `/api/services/:id` | PUT / DELETE | editar / desactivar (`is_active=false`, nunca borrar con citas) |
| `/api/resources` | GET / POST / PUT | ídem recursos |
| `/api/appointments` | GET | (existente) añadir al SELECT: service_id→name, resource_id→name, extra |
| `/api/reminders/summary` | GET | enviados/mes, pendientes, cupo restante (para el panel) |

Frontend (mínimo de esta fase): página «Servicios» (tabla editable) y aviso de
cupo en el dashboard. La selección de vertical se añade a `/onboarding/store`.

---

## 7. Plantillas de Meta — listas para enviar a aprobación

Idioma `es`, sin cabecera. Crear en WhatsApp Manager de la WABA. Los botones son
quick-reply (payload se inyecta al enviar con `buttonPayloads`, ya soportado por
`buildTemplateComponents`). **Nombres versionados `_v1`** como la existente.

### 7.1 `canalagenda_recordatorio_24h_v1` — categoría UTILITY

```
Hola {{1}}, te recordamos tu cita de {{2}} mañana {{3}} a las {{4}} en {{5}}.

¿Todo en pie?
```
Botones: `Confirmo` · `Cambiar cita` · `Cancelar cita`
Variables: 1=nombre cliente (o «hola» genérico), 2=servicio, 3=fecha («jueves 16»), 4=hora, 5=nombre negocio.

### 7.2 `canalagenda_recordatorio_2h_v1` — UTILITY

```
{{1}}, tu cita de {{2}} es hoy a las {{3}} en {{4}}. ¡Te esperamos!
```
Botones: `Confirmo` · `No puedo ir`

### 7.3 `canalagenda_coche_listo_v1` — UTILITY (taller)

```
Tu vehículo {{1}} ya está listo en {{2}}. Importe: {{3}}.
Puedes recogerlo hasta las {{4}}.
```
Botones: `Voy hoy` · `Voy mañana`

### 7.4 `canalagenda_resena_v1` — MARKETING (fase 2 de esta entrega)

```
¡Gracias por tu visita a {{1}}! Si has quedado contento/a, nos ayuda mucho
una reseña en Google: {{2}}
```
Sin botones (el enlace va como variable en el cuerpo). **Nota:** Meta suele
clasificar la petición de reseña como marketing → coste marketing y respeto de
opt-out obligatorio. Enviar solo si `contact_optouts` no contiene el teléfono.

### 7.5 `canalagenda_recompra_itv_v1` — MARKETING (taller, fase 2)

```
Hola {{1}}, la ITV de tu vehículo {{2}} caduca en torno al {{3}}.
En {{4}} te lo gestionamos sin que pierdas la mañana.
```
Botones: `Reservar pre-ITV` · `Ya la pasé` · `No, gracias`
(`No, gracias` → `registerOptout(source='recompra')`.)

**Regla de envío de marketing:** siempre con opt-out visible, cupo aparte y
nunca a quien esté en `contact_optouts` (cualquier `source`).

---

## 8. Orden de desarrollo por bloques (cada uno con su DoD)

> Incrementos pequeños; no empezar un bloque sin el DoD del anterior en verde.
> Los bloques B1-B4 son el mínimo para la demo de venta del vertical 1.

**B1 — Senders interactivos + menú de bienvenida.**
Desarrollar: `sendInteractiveButtons`, `sendInteractiveList`, generalización de
`sendAndLog`, router `ca:*` (§1.3), estado `MENU`.
DoD: escribir «hola» al número de pruebas → menú con 3 botones; tocar cada botón
responde algo coherente; los comandos antiguos siguen funcionando; mensajes
interactivos logueados en `messages`; rate-limit aplica.

**B2 — Migración de catálogo + flujo reserva completo (peluquería, sin recursos).**
Desarrollar: migración §2 (+ consolidado), seed peluquería, estados
SELECT_SERVICE → CONFIRM → insert con `service_id` y duración variable en
`generate30MinSlots`.
DoD: reserva de un Tinte (120 min) de punta a punta solo con toques; el evento
de Calendar dura 2 h; carrera provocada (dos confirmaciones al mismo hueco) →
segunda recibe «acaba de reservarse» y no hay evento huérfano; test de
aislamiento entre 2 tiendas.

**B3 — CANCELAR + MIS CITAS.**
Desarrollar: flujos §3.2, texto «cancelar»/«mis citas».
DoD: cancelar libera el hueco (se puede rereservar), borra evento de Calendar y
marca reminders skipped; «mis citas» lista solo las futuras del teléfono y
tienda correctos.

**B4 — Recordatorios 24h/2h.**
Desarrollar: `appointment_reminders`, despachador en el cron (§5), plantillas
7.1 y 7.2 aprobadas, payloads `ca:apt:*` del recordatorio.
DoD: cita creada a >24 h genera 2 filas pending; cron las envía a su hora
(probar acortando `scheduled_at` a mano); botón Confirmo marca la cita; botón
Cancelar cita la cancela; cupo mensual se respeta; dedupe: relanzar el cron no
reenvía (PK compuesta).

**B5 — Recursos (empleados) + paquete taller.**
Desarrollar: SELECT_RESOURCE, seed taller, EXTRA_AVERIA/EXTRA_MATRICULA (regex),
`mode='franja'`, rama urgencia, plantilla 7.3.
DoD: reserva de Diagnóstico con avería y matrícula visibles en el panel y en la
descripción del evento; franja de pre-ITV bloquea media jornada; «no arranca» →
teléfono. ⚠️ Recordar: multi-recurso simultáneo NO entra (índice §2).

**B6 — Panel: servicios y cupo.**
Desarrollar: rutas §6 + página Servicios + vertical en onboarding.
DoD: el dueño edita nombre/duración/precio sin SQL y el bot lo refleja en la
siguiente conversación; usuario de otra tienda no ve/edita servicios ajenos
(test de aislamiento).

**B7 — Post-cita y recompra (fase 2 de esta entrega).**
Desarrollar: reminders `resena` (peluquería, +3 h) y `recompra` (ITV +11 meses;
color +5 semanas), plantillas 7.4/7.5, respeto estricto de opt-out.
DoD: cita completada genera reseña a las 3 h solo si no hay opt-out; «No,
gracias» de la recompra registra opt-out y nunca vuelve a enviarse.

---

## 9. Casos límite que el desarrollo debe cubrir (checklist de pruebas)

- [ ] Doble toque rápido al mismo botón de confirmar (dos webhooks) → una sola cita (idempotencia WAMID + revalidación).
- [ ] Botón de una conversación caducada (`ca:res:slot` con flujo expirado) → «Esa selección caducó, empecemos de nuevo» + menú (payload huérfano NUNCA revienta).
- [ ] `ca:apt:cancel:<id>` con id de OTRA tienda/teléfono → «No encuentro esa cita» (validación §1.2).
- [ ] Hoy sin huecos restantes → botón [Hoy] no aparece; día cerrado → no aparece y si llega por texto → «Ese día estamos cerrados» + alternativas.
- [ ] Servicio desactivado con el flujo a medias → al confirmar, revalidar que el servicio sigue activo.
- [ ] Cliente escribe texto en paso de botones 3 veces → ofrecer humano.
- [ ] Recordatorio programado y cita cancelada después → skipped, no se envía.
- [ ] Tienda sin catálogo (`services` vacío) → el flujo guiado salta SELECT_SERVICE y usa la duración de la tienda (compatibilidad con las 2 tiendas actuales).
- [ ] Timezone: tienda en Canarias (`Atlantic/Canary`) → «hoy/mañana» y huecos correctos.
- [ ] Logs `[Flujo]`, `[Recordatorios]` en español con storeId y paso.

---

## 10. Referencias cruzadas

- Guiones funcionales completos y ramas: `ESTUDIO-DISENO-WHATSAPP-CANALAGENDA.docx` §4 (raíz de la carpeta del proyecto).
- Reglas fijas: `INSTRUCCIONES-PROYECTO.md`. Plan general: `GUIA-PASO-A-PASO.md`.
- Patrón de motor con comprobaciones anti-coste y dedupe: `docs/07-modulo-missed-call.md`.
- Extractor de botones/listas (NO tocar): `backend/src/whatsappCloud.js` → `extractIncomingMessages`.
