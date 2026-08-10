# Runbook de incidencias — CanalAgenda

> Síntoma → causa probable → solución, destilado de todo lo vivido en el
> desarrollo (jul-2026). Para el fundador y para cualquier IA que opere el
> sistema. Herramientas: logs de Render (backend), `/admin` (backoffice con
> incidencias automáticas y actividad por tienda), Supabase SQL Editor.

## 0. Empieza SIEMPRE por aquí: el bloque de Salud de `/admin`

Antes de leer ningún log, abre `/admin` y mira el bloque de arriba. Reúne en
un sitio todo lo que este sistema es capaz de romper en silencio, agrupado por
problema y no por tienda:

| Línea | Qué significa cuando está en rojo |
|---|---|
| **Errores del sistema** | Algo ha reventado de verdad: el buzón de `errores.js`. Sale agrupado y con su contador. Botón *Visto* para silenciarlo — si vuelve a ocurrir, reaparece solo |
| **Planificador** | No corre el cron: no salen recordatorios, no se detectan borrados de Calendar ni citas huérfanas. Revisa cron-job.org y el secreto `INTERNAL_CRON_TOKEN` de GitHub |
| **Base de datos** | Falta ejecutar una migración. Dice cuál y para qué sirve. **Esto no da error en ningún otro sitio**: la función simplemente deja de trabajar |
| **WhatsApp / Tokens** | Cuenta sin conectar, desactivada o token caducado |
| **Google Calendar** | Tienda sin calendario conectado |
| **Horarios** | Sin horario = el bot NO ofrece citas ese día (es a propósito) |
| **Plantillas de Meta** | Módulo activo con plantilla sin aprobar: los avisos fuera de 24 h no salen |
| **Inteligencia artificial** | Apagada, o tope diario superado. El asistente sigue con botones |
| **Servicios sin nadie** | Con B5.5, un servicio que ninguna profesional puede hacer. **El asistente ha dejado de ofrecerlo** |

Cada línea se despliega para ver qué tiendas están afectadas.

**Si el bloque está verde y aun así algo falla, es un problema que no
estábamos vigilando.** Cuando lo resuelvas, añade la comprobación aquí y su
prueba en `backend/test/salud.test.js`. Es la única forma de que la lista
crezca con lo que de verdad pasa.

## 1. El bot no responde nada por WhatsApp

| Comprueba | Cómo |
|---|---|
| ¿Llega el webhook? | Render → backend → Logs: busca `[WhatsAppCloud]` al enviar un mensaje. Si no aparece nada, el problema está en Meta (webhook caído o token). |
| ¿Backend vivo? | `https://app-whatsapp-backend.onrender.com/health?db=1` → debe dar OK. Free tier: la primera petición tras inactividad tarda ~50 s (spin down). |
| ¿Token caducado? | `/admin` lo muestra como incidencia. Solución: generar token nuevo en Meta y actualizarlo en el panel de la tienda (onboarding WhatsApp) o en `whatsapp_accounts`. |
| ¿Firma rechazada? | Log `firma inválida` → `META_APP_SECRET` en Render no coincide con la app de Meta. |
| ¿Cuenta inactiva? | `whatsapp_accounts.is_active = false` → el webhook ignora esa tienda a propósito. |

## 2. "Ha ocurrido un error guardando tu cita"

Casi siempre: **código desplegado antes que la migración SQL** (columna
inexistente). Regla sagrada: migración primero, deploy después. Ver el error
exacto en logs (`[DB] Error`/`[WhatsAppCloud] Error creando cita`). Si es
`23505`: no es un error, es el anti doble-reserva funcionando (carrera).

## 3. [Reservar cita] no muestra la lista de servicios

`services` vacío o sin migrar para esa tienda → el bot degrada al texto
puente (por diseño). Solución: la tienda crea servicios en `/catalogo`, o
elige vertical en el onboarding, o `scripts/seed_demo_peluqueria.sql` (demo).

## 3.bis El bot ofrece huecos en días u horas que no toca

Desde el 28-jul-2026 la regla es **fail-safe: un día sin horario configurado
se considera CERRADO** (antes se asumía "abierto 08:00-17:00", y una tienda
con el horario a medias daba citas los sábados a las 8 de la mañana).
Consecuencia: si el bot no ofrece NADA ningún día, lo primero es mirar
`/admin` — saldrá la incidencia *"Sin horario configurado"*. Solución: entrar
en el panel de esa tienda → **Horarios** → ajustar y **Guardar** (guarda
siempre los 7 días). Los horarios reales mandan sobre cualquier valor por
defecto del código.

## 3.ter Borré la cita en Google Calendar y el hueco sigue ocupado

Una cita vive en **dos sitios**: la base de datos y el Google Calendar de la
tienda. Desde el 4-ago-2026 el sistema vigila el calendario y, cuando el
evento ya no está, **cancela la cita y devuelve el hueco** (además avisa a la
lista de espera si la tienda tiene el flag `waitlist`).

Ocurre en dos momentos:

- **Al instante**, cuando alguien consulta huecos de ese día: el flujo ya pide
  los eventos a Google, así que detectar la ausencia no cuesta nada.
- **Cada 10 minutos**, en la pasada del cron (`sincronizacion_calendar` en la
  respuesta de `/internal/missed-calls/dispatch`), revisando los próximos 30
  días de todas las tiendas con calendario conectado.

Si hace falta verlo ya: panel → **Agenda** → botón **↻ Google Calendar**.

Por seguridad, **nunca se cancela una cita "porque no aparece en el listado"**:
antes se pregunta a Google por ese evento concreto y solo se cancela si
responde que no existe (404/410) o que está cancelado. Si Google no responde,
no se toca nada y se reintenta en la siguiente pasada — se prefiere un hueco
bloqueado de más a una clienta cancelada por error.

Diagnóstico en los logs de Render: `[Sync] Cita liberada`, `[Sync] Hueco
recuperado al vuelo`, `[Sync] No se pudo leer el calendario`.

Se puede apagar en panel → **Equipo** → *Vigilar mi Google Calendar*
(columna `stores.usar_sync_calendar`, migración
`database/migration_sync_calendar.sql`).

## 3.quater El bot ofrece muy pocas horas para un servicio largo

Hasta el 4-ago-2026 los huecos se generaban en **bloques del tamaño del
servicio**: un sábado de 10:00 a 14:00 con Mechas (2h30) solo ofrecía las
10:00, porque el siguiente bloque (12:30→15:00) no cabía — y 11:30→14:00,
que estaba libre, no se ofrecía nunca. Dinero perdido a diario.

Ahora la tienda elige la **rejilla** en panel → **Horarios** → *¿Cada cuánto
pueden empezar las citas?* (15 / 30 / 60 minutos o bloques). Por defecto 30.
Columna `stores.paso_huecos_min`, migración `database/migration_paso_huecos.sql`.

Cuenta rápida para saber si lo que ves es correcto: **la última hora ofrecible
es la del cierre menos la duración del servicio**. Si aun así salen menos de
las esperadas, mira los turnos del equipo ese día (el turno debe cubrir el
servicio ENTERO) y si el servicio exige un aparato ya ocupado.

## 4. El panel web falla

- **404 en /login** y se ve "Inicio · Precios · Solicitar acceso" → estás en
  la LANDING, no en el panel. El panel es el servicio Render
  `app-whatsapp-frontend` (repo principal, root `frontend`).
- **Build "Failed" con `supabaseUrl is required`** → faltan las 3 variables
  `NEXT_PUBLIC_*` en Environment del servicio del panel.
- **La página carga pero "no se pudo conectar con el backend"** → CORS:
  añadir la URL del panel a `DASHBOARD_ORIGIN` (backend, lista por comas).
- **La interfaz sale ROTA: iconos gigantes, menús desmontados, títulos
  descolocados** → Tailwind ha borrado clases al compilar. Causa habitual:
  se ha añadido una carpeta nueva de código (p. ej. `components/`) y NO está
  en `content` de `tailwind.config.ts`. Comprobarlo es lo primero.
  (Incidente real 3-ago-2026.) Además, los iconos SVG llevan `width`/`height`
  explícitos para que nunca se vean gigantes aunque falle el CSS.
- **El build de Render falla con "declared but its value is never read"** →
  `noUnusedLocals` está activo: cualquier variable o import sin usar tumba el
  despliegue. Antes de cada push del frontend:
  `cd frontend && ./node_modules/.bin/tsc --noEmit`
- **Estilos:** el panel usa tema CLARO con el sistema de `globals.css`
  (`ca-card`, `ca-btn-primary`, `ca-input`, `ca-badge-ok`…). No inventar
  clases sueltas: reutilizar esas.
- **Contraseña olvidada de un usuario de prueba** (emails ficticios: la
  recuperación por correo NO funciona). El `update` de `auth.users` con
  `crypt()` es frágil. **Vía fiable:** Supabase → Authentication → Users →
  **Add user → Create new user** (email + contraseña + ✅ *Auto Confirm
  User*), y luego vincularlo a la tienda:
  ```sql
  insert into store_users (store_id, user_id, role)
  select '<STORE_ID>', id, 'owner' from auth.users where email = '<EMAIL>';
  ```
- ⚠️ **"He configurado el panel y el bot no se enteró"** (incidente real
  30-jul-2026): había varios usuarios de prueba, cada uno dueño de una tienda
  distinta, y se estaba editando la tienda equivocada. Los logs lo cantan
  (`[DB] Horario semanal actualizado { storeId: ... }`). Comprobación rápida:
  el **título del panel muestra el nombre del negocio** que estás gestionando;
  y esta consulta dice quién es dueño de qué:
  ```sql
  select u.email, s.name from store_users su
  join auth.users u on u.id = su.user_id join stores s on s.id = su.store_id;
  ```

## 5. Recordatorios o missed-call no se envían

### 5.0 ANTES DE NADA: ¿está vivo el planificador? (incidente real 28-jul-2026)
El cron externo de cron-job.org **se autodesactivó** tras varios errores HTTP
seguidos y estuvo semanas sin ejecutarse **en silencio**: cero recordatorios,
cero despacho de llamadas, cero avisos de tokens, y ningún error en los logs
del backend (porque nadie lo llamaba). Comprobación en 30 segundos:
cron-job.org → Panel → debe poner **"1 cronjob habilitado"** y en *Next Runs*
una próxima ejecución. Si pone 0 habilitados o aparece en *Failed Cronjobs*:
editar el cronjob, volver a **habilitarlo** y **Guardar** (la ejecución de
prueba NO lo reactiva). Un 429 puntual en la prueba manual suele ser Render
frenando mientras el servicio despierta: espera 3 min y repite.
**Reparto de responsabilidades entre los dos planificadores:**
- **Principal: cron-job.org cada 10 minutos.** Los 10 min no son capricho:
  el plan gratuito de Render duerme el servidor a los ~15 min de inactividad
  y despertarlo cuesta 30-60 s (por eso el primer WhatsApp del día tarda).
  Llamando cada 10 min, el backend se mantiene despierto.
- **Respaldo: `.github/workflows/cron-despachador.yml`, una vez por hora.**
  Despierta el backend, reintenta y GitHub avisa por email si falla. Estaba
  cada 15 min y se comía los 2.000 min/mes gratuitos de Actions en repos
  privados. Una vez por hora basta: las ventanas de recordatorio son de horas.
  Requiere el secreto `INTERNAL_CRON_TOKEN` en GitHub.
- El endpoint es idempotente: que lo llamen dos planificadores no duplica nada.
- **Cuando haya el primer cliente de pago:** instancia de pago en Render
  (~7 $/mes) y se acabaron los arranques en frío. No antes.

### 5.1 Descartes del motor

Orden de descartes del motor (los logs dicen cuál corta): módulo
enabled → `template_status='approved'` → ventana temporal → opt-out →
horario silencioso (21-9h, encola) → cupo mensual → cuenta WhatsApp →
dedupe. El desglose de descartes está en las métricas M5
(`/api/missed-call/metrics`). El cron (cron-job.org, cada 15 min) debe dar
200; si da 401, la cabecera `x-internal-token` no coincide.

## 6. Plantillas de Meta

- "Utilidad" se llama ahora **Servicio**; NUNCA elegir "Solicitud de
  permisos de llamada" (produce plantillas inservibles).
- Si Meta recategoriza a Marketing (pasó con `canalagenda_waitlist_v1`):
  aceptar — el código es agnóstico; solo cambia el coste por envío.
- Aviso "podría rechazarse" al enviar: mandarla igual; suele aprobar.
- Tras aprobar: marcarla desde **`/admin`** → tarjeta de la tienda → "Módulos
  con plantilla de Meta" → [Plantilla aprobada ✓] y [Activado]. (Ya no hace
  falta SQL; el endpoint hace upsert, así que sirve para tiendas antiguas.)
- ⚠️ **El TEXTO de los botones se fija en Meta, no en el código.** Nosotros
  enviamos las acciones por POSICIÓN (1ª = confirmar, 2ª = cancelar). Si al
  crear la plantilla se escribe mal el texto (pasó en `reminder_v1`: el
  segundo botón decía "Confirmar cita" en vez de "Cancelar cita"), el botón
  hace lo correcto pero confunde al cliente. Se corrige editando la plantilla
  en WhatsApp Manager. Sin riesgo de cancelaciones accidentales: el flujo
  siempre pregunta "¿Seguro? SI/NO" antes de cancelar.

## 7. Flags premium no hacen efecto

Efectivo = `stores.premium_features` (contratado, se toca en `/admin`)
MENOS `stores.features_disabled` (apagado por la tienda en `/servicios`).
Comprobar ambos. Si la migración `premium_features` no está aplicada, el
lector devuelve `{}` (todo apagado) sin romper nada — aplicarla.

## 8. Git y despliegue

- Push denegado → credenciales de otro usuario en el Credential Manager de
  Windows; usar SOLO `datos-visual`.
- Deploy automático: push a `main` despliega backend Y panel. Verificar
  "Deploy live" y en el backend el log `[API] Servidor escuchando`.
- Rollback: botón Rollback en Render (o `git revert` + push).

## 9. Para las IA que trabajen en el código (trampas del entorno)

Ver VISION-GLOBAL-PROYECTO.md §10.3: el sandbox Linux puede servir ficheros
MODIFICADOS truncados (¡a veces parsean pero pierden exports!). Lo
autoritativo es el disco de Windows (Read/Grep). Tests de lógica: copiar a
/tmp. `pip` requiere `--break-system-packages`.

## 10. Escalada

Si nada de lo anterior aplica: (1) logs de Render con la hora exacta del
fallo; (2) `/admin` → Ver actividad de la tienda (mensajes y citas); (3) en
Supabase, `conversation_state` de ese teléfono (estados atascados se limpian
borrando la fila — el bot tiene además escape anti-bucle automático).
