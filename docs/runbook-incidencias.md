# Runbook de incidencias — CanalAgenda

> Síntoma → causa probable → solución, destilado de todo lo vivido en el
> desarrollo (jul-2026). Para el fundador y para cualquier IA que opere el
> sistema. Herramientas: logs de Render (backend), `/admin` (backoffice con
> incidencias automáticas y actividad por tienda), Supabase SQL Editor.

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

## 4. El panel web falla

- **404 en /login** y se ve "Inicio · Precios · Solicitar acceso" → estás en
  la LANDING, no en el panel. El panel es el servicio Render
  `app-whatsapp-frontend` (repo principal, root `frontend`).
- **Build "Failed" con `supabaseUrl is required`** → faltan las 3 variables
  `NEXT_PUBLIC_*` en Environment del servicio del panel.
- **La página carga pero "no se pudo conectar con el backend"** → CORS:
  añadir la URL del panel a `DASHBOARD_ORIGIN` (backend, lista por comas).
- **Texto invisible / sin contraste** → el panel usa tema oscuro global:
  toda página nueva debe usar clases slate + `text-white`, no tarjetas blancas.
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
**Red de seguridad añadida:** `.github/workflows/cron-despachador.yml` —
segundo despachador en GitHub Actions cada 15 min, que despierta al backend
antes, reintenta y avisa por email si falla. Requiere el secreto
`INTERNAL_CRON_TOKEN` en GitHub. El endpoint es idempotente: que lo llamen
dos planificadores no duplica envíos.

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
