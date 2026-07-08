# GUÍA PASO A PASO — De donde estamos a Fase 1 completa

Esta guía desarrolla el plan aprobado en la fase de estudio. Cada paso indica
**qué haremos, por qué, qué haces tú, qué hace el asistente y cómo lo verificamos**.
El orden importa: cada paso desbloquea el siguiente.

**Cómo trabajar en cada sesión:** pega `INSTRUCCIONES-PROYECTO.md`, di en qué
paso estamos y qué salida obtuviste del paso anterior.

---

## PASO 0 — Verificar el estado real del Supabase

**Qué haremos:** averiguar qué tablas, columnas e índices existen DE VERDAD en
tu Supabase de producción.

**Por qué:** `schema.sql` está desactualizado y las migraciones pudieron
aplicarse en distinto orden o parcialmente. Cualquier cambio de BD (pasos 3-6)
que parta de una foto equivocada puede romper producción. Primero foto real,
luego cambios.

**Qué haces tú:**

1. Comprueba que `backend/.env` tiene `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` reales.
2. Desde la raíz del repo ejecuta:
   ```bash
   node scripts/verificar-supabase.js
   ```
   El script es solo lectura: sondea cada tabla/columna vía la API REST y
   dice OK o FALTA. No modifica nada.
3. En Supabase → SQL Editor, ejecuta esta consulta (también solo lectura) y
   copia el resultado:
   ```sql
   -- Columnas reales de todas las tablas
   select table_name, column_name, data_type, column_default
   from information_schema.columns
   where table_schema = 'public'
   order by table_name, ordinal_position;

   -- Índices reales (aquí se ve si el anti doble-reserva es el parcial correcto)
   select indexname, indexdef
   from pg_indexes
   where schemaname = 'public'
   order by indexname;

   -- Constraints (para confirmar qué valores acepta appointments.source/status)
   select conname, pg_get_constraintdef(oid)
   from pg_constraint
   where connamespace = 'public'::regnamespace;
   ```
4. Pega ambas salidas en el chat.

**Qué hace el asistente:** comparar la foto real con el código y las
migraciones, y confirmar o corregir el schema consolidado del paso 3.

**Verificación / hecho cuando:** tenemos la lista real de tablas, columnas,
índices y constraints, y sabemos exactamente qué migraciones están aplicadas.

**Puntos clave a confirmar en la salida:**
- `messages.message_id` existe y su índice único es PARCIAL (`WHERE message_id IS NOT NULL`).
- El índice de appointments es el PARCIAL `WHERE status = 'confirmed'`
  (y NO existe el FULL `appointments_store_start_at_unique`).
- Existen `conversation_state` y `store_business_hours`.
- `stores` tiene `timezone` y `appointment_duration_minutes`.
- Qué acepta el constraint de `appointments.source` ('whatsapp' vs 'whatsapp_cloud').

---

## PASO 1 — Saneamiento de secretos (en paralelo al resto)

**Qué haremos:** asegurar que ninguna credencial pueda filtrarse, y rotar las
que ya se han compartido.

**Por qué:** verificado en la fase de estudio: git está LIMPIO (ni el JSON de
la service account ni ningún `.env` se han commiteado nunca). Pero:
- `JSON/whatsapp-reservas-*.json` contiene la private key REAL de Google y
  vive en la carpeta compartida.
- Los ZIPs (`proyecto-app-whatsapp.zip`, `GIT/versiones/*.zip`) contienen
  `backend/.env` con la `SUPABASE_SERVICE_ROLE_KEY` real.
- Esta carpeta se ha compartido (con asistentes de IA, posiblemente con otros).
  Una credencial compartida se considera expuesta: se rota.

**Qué haces tú:**

1. **Rotar la service account de Google** (Google Cloud Console → IAM →
   Service Accounts → `calendar-reservas@whatsapp-reservas-489313...` →
   Keys → Add key → crear nueva → borrar la antigua). Descarga el JSON nuevo
   **fuera** de esta carpeta (p. ej. un gestor de contraseñas o carpeta privada).
2. **Actualizar en Render** `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY` con la
   clave nueva (recuerda escapar los saltos: `\n`).
3. **Rotar la SERVICE_ROLE_KEY** en Supabase (Settings → API → roll/regenerate)
   y actualizarla en Render y en tu `backend/.env` local.
4. **Sacar de la carpeta compartida:** la carpeta `JSON/` y los ZIPs con `.env`
   dentro (`proyecto-app-whatsapp.zip` y `GIT/versiones/`). Muévelos a una
   ubicación privada o bórralos si ya no aportan.
5. Probar que todo sigue funcionando (ver verificación).

**Qué hace el asistente:** añadir a `.gitignore` patrones defensivos
(`*.zip`, `JSON/`, `*.pem`, `*service*account*.json`), crear `.gitattributes`
y normalizar los line endings (hoy TODO el repo aparece como modificado por
CRLF, lo que haría ilegible cualquier diff futuro).

**Verificación / hecho cuando:**
- `curl https://TU-BACKEND.onrender.com/health?db=1` → 200 (Supabase OK con la clave nueva).
- Enviar un mensaje de WhatsApp de prueba → el bot responde y crea evento en
  Calendar (Google OK con la clave nueva).
- `git status` queda limpio tras la normalización y un `git diff` de un cambio
  de una línea muestra UNA línea.

---

## PASO 2 — Fix [F]: no ofrecer horas ya pasadas

**Qué haremos:** al pedir `DISPONIBLE <hoy>`, filtrar los huecos anteriores a
la hora actual (en la timezone de la tienda). Opcionalmente, corregir también
que "citas de hoy" del dashboard y el corte del rate-limit usan la fecha del
servidor en vez de la timezone de la tienda.

**Por qué:** hoy el bot ofrece las 09:00 aunque sean las 18:00. Es un bug
visible para el cliente final, el arreglo es pequeño (~15 líneas en
`calendar.js/generateSlots`) y de bajo riesgo: ideal como primer cambio de
código para validar nuestra forma de trabajar (cambio → revisión → deploy → prueba).

**Qué hace el asistente:** modificar `generateSlots` para que, si el día
solicitado es "hoy" en la zone de la tienda, el cursor arranque en el primer
slot posterior a `DateTime.now().setZone(zone)`. Sin tocar nada más.

**Qué haces tú:** revisar el diff, hacer commit/push, y probar.

**Verificación / hecho cuando:**
- `DISPONIBLE <hoy>` no muestra horas pasadas.
- `DISPONIBLE <mañana>` muestra el día completo (regresión controlada).
- `CITA <hoy> <hora pasada>` responde "ya no está disponible".

---

## PASO 3 — [B] Schema consolidado (fuente de verdad única)

**Qué haremos:** crear `database/schema_consolidated.sql`: un único fichero
idempotente (`IF NOT EXISTS`) que refleje el estado real de la BD tras todas
las migraciones (validado con la salida del paso 0). Los ficheros antiguos se
mueven a `database/applied/` como histórico.

**Por qué:** hoy, si alguien monta la BD con `schema.sql`, la app revienta
(faltan `messages.message_id`, `conversation_state`, `store_business_hours`,
`stores.timezone`...) y además crea el índice único FULL equivocado que
bloquearía citas canceladas+rereservadas. Necesitamos poder recrear la BD
(entornos de prueba, staging, desastre) con un solo fichero fiable.

**Qué hace el asistente:** escribir el consolidado con todas las tablas,
índices parciales correctos, comentarios explicando cada índice crítico, y un
README en `database/` explicando el flujo futuro de migraciones (una migración
nueva por cambio + actualizar el consolidado).

**Qué haces tú:** revisarlo y darle OK. **No se ejecuta nada en tu Supabase**
salvo que el paso 0 destape diferencias; en ese caso el asistente propondrá una
migración correctiva mínima y esperará tu OK explícito.

**Verificación / hecho cuando:** ejecutar el consolidado en un proyecto
Supabase NUEVO (gratuito, de prueba) + arrancar el backend contra él +
simular un webhook → todo funciona sin tocar SQL a mano.

---

## PASO 4 — [A] Autenticación y aislamiento de acceso (el cambio más importante)

**Qué haremos:** que cada usuario de tienda tenga cuenta (Supabase Auth), esté
vinculado a SU tienda, y que las rutas `/api/*` deriven el `store_id` de la
sesión — no de un parámetro libre.

**Por qué:** hoy el multi-tenant es correcto en DATOS pero no en ACCESO:
cualquiera con el `ADMIN_TOKEN` global ve CUALQUIER tienda cambiando el
`store_id` del input. Además `NEXT_PUBLIC_ADMIN_TOKEN` puede incrustar el token
en el bundle público. Esto es lo que separa el prototipo de un SaaS vendible.

**Sub-pasos (incrementales, cada uno desplegable por separado):**

**4.1 — Tabla de vínculo usuario↔tienda (migración SQL):**
```sql
create table if not exists public.store_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);
create unique index if not exists store_users_user_store_unique
  on public.store_users (user_id, store_id);
```
Se ejecuta en Supabase SQL Editor tras tu OK. En Fase 1: un usuario → una tienda.

**4.2 — Backend, modo dual (sin romper lo existente):** nuevo middleware que
acepta (a) `Authorization: Bearer <JWT de Supabase Auth>` → valida el JWT con
`supabase.auth.getUser(token)`, busca su tienda en `store_users` y fija
`req.storeId`; o (b) el `ADMIN_TOKEN` actual (pasa a ser solo para ti como
admin, y con él sí se permite `?store_id=`). Las rutas usan `req.storeId` e
ignoran el query param en modo usuario. El dashboard actual sigue funcionando
durante la transición.

**4.3 — Frontend: página de login** (email/password contra Supabase Auth con
la ANON KEY pública — esa sí puede ir en `NEXT_PUBLIC_*`, está diseñada para
ello). El dashboard guarda la sesión, manda el JWT en cada llamada y
desaparecen los inputs de Store ID y token admin.

**4.4 — Retirada:** eliminar `NEXT_PUBLIC_ADMIN_TOKEN` del código, el input
manual de store_id, y el fichero muerto `backend/src/whatsappClient.js`.

**Qué haces tú:** ejecutar la migración 4.1, crear el primer usuario de prueba,
vincularlo a la tienda demo (INSERT en `store_users`), configurar
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el frontend,
y probar cada sub-paso.

**Verificación / hecho cuando:**
- Login con usuario de tienda demo → ve SOLO sus citas/mensajes.
- Con JWT de usuario, `GET /api/appointments?store_id=<otra tienda>` devuelve
  los datos de SU tienda (el parámetro se ignora) o 403.
- Sin token → 401. Con ADMIN_TOKEN → funciona como hasta ahora.
- El webhook de WhatsApp sigue funcionando igual (no se toca su flujo).

---

## PASO 5 — [C] Onboarding de 4 pasos

**Qué haremos:** las pantallas `/register`, `/login`, `/onboarding/store`,
`/onboarding/calendar`, `/onboarding/whatsapp` + los endpoints backend que las
soportan, con estado derivado de la tienda: `draft → calendar_connected /
whatsapp_connected → ready`.

**Por qué:** hoy dar de alta una tienda es un INSERT manual por SQL. Con el
paso 4 hecho (ya hay usuarios), esto convierte el alta en autoservicio
semimanual, tal como define el PDF de arquitectura (la tienda pega su
`google_calendar_id`, `phone_number_id` y `access_token`).

**Sub-pasos:**
1. `POST /api/stores` — crea la tienda, la vincula al usuario en `store_users`,
   y crea `store_business_hours` por defecto. Campos: nombre, email, teléfono,
   timezone, duración de cita.
2. `POST /api/onboarding/calendar` — guarda `google_calendar_id` en
   `calendar_connections` + botón **"Probar conexión"** (`events.list` de prueba;
   detecta calendario no compartido con la service account).
3. `POST /api/onboarding/whatsapp` — guarda `phone_number_id` + `access_token`
   en `whatsapp_accounts` (validando que no haya otro `phone_number_id` activo
   igual) + botón **"Probar conexión"**.
4. `GET /api/store/status` — estado derivado para pintar el progreso del
   onboarding y el dashboard.
5. Las pantallas Next.js, reutilizando el estilo del dashboard actual.

**Qué haces tú:** probar el circuito completo con una tienda nueva real.

**Verificación / hecho cuando:** una tienda nueva pasa de registro a `ready`
sin que nadie toque SQL, y su bot responde por WhatsApp.

---

## PASO 6 — [E] Caducidad de tokens de WhatsApp

**Qué haremos:** columna `whatsapp_accounts.token_expires_at` (migración),
campo opcional en el onboarding, aviso en dashboard y logs cuando falten <7 días,
y documentar el procedimiento de renovación. El cifrado de columna queda
documentado como mejora de Fase 2.

**Por qué:** riesgo 11.1 del PDF: con tokens temporales la operativa se cae en
silencio al caducar. Un aviso a tiempo evita tiendas muertas sin saberlo.

**Verificación / hecho cuando:** poner una fecha de caducidad próxima en la
tienda demo → aparece el aviso en dashboard y en logs.

---

## MÓDULO "LLAMADA PERDIDA → WHATSAPP" (missed-call) — añadido jul-2026

Módulo aditivo aprobado tras el informe de viabilidad: captura llamadas no
contestadas (desvío condicional → DID Twilio → webhook de voz) y envía una
plantilla de WhatsApp que desemboca en el flujo de reservas.
Documentación completa: `docs/07-modulo-missed-call.md` (técnica) y
`docs/onboarding-desvio-llamadas.md` (para el cliente final).

Estado de sus incrementos:

| Incremento | Qué es | Estado |
|---|---|---|
| M1 | Migración SQL (5 tablas) + consolidado | ✅ Hecho y aplicado en Supabase |
| M2 | Webhook de voz Twilio (firma + TwiML + registro idempotente) | ✅ Hecho |
| M3 | Motor de envío (dedupe día natural, cupo, horario silencioso, optout) + despachador con cron externo gratuito | ✅ Hecho; cron en cron-job.org operativo |
| M4 | Botones genéricos (plantilla+interactivos), BAJA/payload optout, atribución de reservas | ✅ Hecho |
| M5 | Endpoints de config y métricas (con € vía ticket_medio_eur) | ⏳ Se construye SOBRE el paso 4 (auth), después de él |
| M6 | Documentación | ✅ Este bloque + docs/ |

Pendiente operativo del módulo (acciones del admin, no de código):
plantilla `canalagenda_missed_call_v1` aprobada por Meta en la WABA de cada
tienda (24-72 h; pedirla el DÍA 0 del alta) · DID de Twilio con regulatory
bundle aprobado · prueba end-to-end del checklist de docs/07.

**ORDEN REVISADO del proyecto (criterio: vender en septiembre primero,
escalar sin ti después):** M1→M4+M6 (hecho) → **paso 4 (auth)** →
**paso 5 (onboarding)** → **M5 (config/métricas sobre auth)** → paso 6
(tokens). Los pilotos se configuran a mano (Fase 1 semimanual por diseño).

## Resumen del orden y dependencias

| Paso | Qué | Depende de | Riesgo |
|---|---|---|---|
| 0 | Foto real del Supabase | — | Nulo (solo lectura) |
| 1 | Secretos: rotar + limpiar + .gitattributes | — | Bajo |
| 2 | Fix slots pasados [F] | — | Bajo |
| 3 | Schema consolidado [B] | 0 | Nulo (no se ejecuta en prod) |
| 4 | Auth + store_users [A] | 0, 3 | Medio (incremental) |
| 5 | Onboarding [C] | 4 | Medio |
| 6 | token_expires_at [E] | 0 | Bajo |

**Empezamos por:** tú lanzas el paso 0 (script + SQL) y arrancas las rotaciones
del paso 1; el asistente prepara mientras tanto el fix del paso 2 y el
`.gitattributes` del paso 1.
