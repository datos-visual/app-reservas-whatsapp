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
- **Login de piloto1 olvidado** → email ficticio, sin recovery. SQL:
  `update auth.users set encrypted_password = extensions.crypt('NUEVA', extensions.gen_salt('bf')) where email='piloto1@test.com';`

## 5. Recordatorios o missed-call no se envían

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
- Tras aprobar: poner `template_status='approved'` (+ `template_name` si es
  versión nueva) en la tabla de settings del módulo, o el motor no envía.

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
