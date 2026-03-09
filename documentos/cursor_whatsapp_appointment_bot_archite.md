# WhatsApp appointment bot architecture
_Exported on 2/26/2026 at 16:48:01 GMT+1 from Cursor (2.5.26)_

---

**User**

# OBJETIVO
Crear un WhatsApp Appointment Bot usando whatsapp-web.js (NO oficial, sin API de Meta).

# STACK
- Backend: Node.js + Express (o Python + FastAPI con pywhatsapp)
- Frontend: Next.js 14 + Tailwind CSS
- Base de Datos: Supabase (PostgreSQL)
- Calendar: Google Calendar API
- WhatsApp: whatsapp-web.js (librería no-oficial)

# REQUERIMIENTOS
1. El bot escanea un código QR (como WhatsApp Web) para conectarse.
2. Recibe mensajes y responde automáticamente basado en palabras clave.
3. Consulta Google Calendar para disponibilidad.
4. Agenda citas creando eventos en el calendar.
5. Dashboard para ver citas y mensajes.
6. El número de WhatsApp debe mantenerse activo (sesión persistente).

# ESTRUCTURA
- /backend (Node.js + whatsapp-web.js)
- /frontend (Next.js)
- /database (Supabase schema)

# NOTAS CRÍTICAS
- Guardar la sesión de WhatsApp para no escanear QR cada vez.
- Manejar reconexiones automáticas si se cae la sesión.
- No hacer spam (máximo 50-100 mensajes/día para evitar bans).
- Este es un MVP para validación, no para producción masiva.

# GENERA
1. Código completo del backend con whatsapp-web.js
2. Frontend dashboard
3. Instrucciones de deploy (Railway/Render + Vercel)
4. Schema de base de datos

---

**Cursor**

Voy a diseñar la estructura completa (backend, frontend y schema), luego crearé los archivos base del proyecto y finalmente te dejaré instrucciones de despliegue paso a paso. Empezaré preparando la estructura y un primer esqueleto de backend y frontend.

Ya he creado una lista de tareas internas y he verificado el estado inicial del workspace. Ahora voy a generar los archivos del backend con whatsapp-web.js y la integración básica con Supabase y Google Calendar.

Ahora crearé los archivos fuente del backend (`index.js`, cliente de WhatsApp, integración con Calendar y Supabase) y luego pasaré al frontend con Next.js.

Backend casi listo a nivel de infraestructura (config, DB, Calendar). Ahora crearé el cliente de WhatsApp con sesión persistente y las rutas Express para que el dashboard pueda consultar estado, citas y mensajes.

El backend básico del bot (Express + whatsapp-web.js + Supabase + Google Calendar) ya está creado y sin errores de lint. Ahora voy a generar el dashboard en Next.js 14 con Tailwind y el schema SQL para Supabase, y luego te detallo cómo desplegar en Railway/Render y Vercel.

He creado el esqueleto del proyecto Next.js. Ahora añadiré configuración de TypeScript/Tailwind y la página de dashboard que consume la API del backend para mostrar estado de WhatsApp, citas y mensajes.

Configuración de Next/Tailwind y TypeScript lista. Ahora crearé el layout y la página principal del dashboard que muestra estado de WhatsApp, QR, citas de hoy y últimos mensajes desde el backend.

El dashboard básico ya está creado y pasa el lint. Ahora definiré el schema SQL para Supabase (clientes, citas, mensajes) y, por último, te escribiré las instrucciones de despliegue en Railway/Render y Vercel.

Código de backend, frontend y schema ya está generado. Ahora te explico cómo configurar las variables de entorno y desplegar en Railway/Render (backend) y Vercel (frontend), incluyendo notas para la persistencia de sesión de WhatsApp.

### ✅ Visión general

Ya tienes en tu workspace:

- **Backend** `backend/` (Node.js + Express + whatsapp-web.js + Supabase + Google Calendar).
- **Frontend** `frontend/` (Next.js 14 app router + Tailwind, dashboard de citas y mensajes).
- **Schema Supabase** `database/schema.sql`.

Te detallo cómo está montado todo y cómo desplegarlo.

---

## 1. Backend con whatsapp-web.js (código generado)

Directorio: `backend`

### 1.1. Dependencias

Archivo `backend/package.json` (ya creado):

- **Prod**: `express`, `cors`, `dotenv`, `whatsapp-web.js`, `qrcode`, `googleapis`, `@supabase/supabase-js`.
- **Dev**: `nodemon`.

Comandos:

```bash
cd backend
npm install
npm run dev   # desarrollo
npm start     # producción
```

### 1.2. Configuración y variables de entorno

Archivo `backend/src/config.js` carga `.env` y expone:

- **Generales**
  - `PORT` (por defecto `4000`)
  - `WHATSAPP_SESSION_PATH` (por defecto `./.wwebjs_session` – carpeta con la sesión persistente)
  - `MAX_MESSAGES_PER_DAY` (por defecto `80`)

- **Supabase**
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`  *(usa la Service Role key, sólo en backend)*

- **Google Calendar (service account)**
  - `GOOGLE_CALENDAR_ID`  *(ID del calendario donde crear citas)*
  - `GOOGLE_CLIENT_EMAIL`
  - `GOOGLE_PRIVATE_KEY`  *(como variable de entorno, con `\n` escapadas; en código se normaliza)*

Ejemplo `.env` en `backend/.env`:

```bash
PORT=4000
WHATSAPP_SESSION_PATH=./.wwebjs_session

SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

GOOGLE_CALENDAR_ID=tu_calendar_id@group.calendar.google.com
GOOGLE_CLIENT_EMAIL=service-account@tu-proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nLINEA...\n-----END PRIVATE KEY-----\n"

MAX_MESSAGES_PER_DAY=80
```

### 1.3. Integración con Supabase

Archivo `backend/src/db.js`:

- Crea el cliente de Supabase con `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
- Funciones:
  - `logMessage({ from, body, fromMe })` → inserta en tabla `messages`.
  - `createOrGetCustomer(phone)` → busca por `phone` en `customers`, si no existe lo crea.
  - `createAppointment({ customerId, start, end, googleEventId, source })`.
  - `getAppointmentsByDate(dateIso)` → cita + `customers(*)` del día.
  - `getRecentMessages(limit)` → últimos mensajes.
  - `getMessagesSentToday()` → cuenta mensajes `from_me=true` hoy (para rate limit).

### 1.4. Google Calendar

Archivo `backend/src/calendar.js`:

- Usa `googleapis` con `JWT` service account.
- Funciones:
  - `listEventsForDay(dateIso)` → eventos de un día.
  - `createCalendarEvent({ summary, description, start, end })` → crea evento.
  - `generate30MinSlots(dateIso, events, workDay)` → genera huecos de 30min (por defecto 9–17h), eliminando solapados con eventos.

### 1.5. Cliente de WhatsApp + lógica bot

Archivo `backend/src/whatsappClient.js`:

- Usa `whatsapp-web.js` con `LocalAuth` y `dataPath = WHATSAPP_SESSION_PATH` → **sesión persistente**, sin escanear QR cada vez.
- Guarda último QR en memoria como `dataURL` con `qrcode.toDataURL` para mostrarlo en el dashboard.
- Manejo de eventos:
  - `qr` → genera `lastQrDataUrl`.
  - `ready` → marca `isReady = true`, limpia QR.
  - `auth_failure` / `disconnected` → marca `isReady = false` y reintenta `client.initialize()`.

- **Lógica de mensajes (MVP keywords):**
  - `DISPONIBLE YYYY-MM-DD`  
    - Lista eventos del día en Google Calendar.
    - Genera slots libres de 30 min.
    - Devuelve hasta 8 huecos: `HH:MM`.
  - `CITA YYYY-MM-DD HH:MM`
    - Verifica que exista slot libre en ese horario.
    - Crea/obtiene `customer` por número de teléfono.
    - Crea evento en Calendar (30 min).
    - Inserta cita en `appointments`.
    - Responde con confirmación e ID de cita.
  - `AYUDA` / `MENU` → envía mini menú con comandos.
  - Cualquier otro mensaje → respuesta corta por defecto pidiendo `AYUDA`.

- **Anti-spam (rate limit):**
  - Antes de responder, llama `getMessagesSentToday()`.
  - Si se supera `MAX_MESSAGES_PER_DAY` → no contesta y loggea.

### 1.6. API Express para el dashboard

Archivo `backend/src/index.js`:

- Rutas:
  - `GET /health` → `{ ok: true }`.
  - `GET /api/whatsapp/status` → `{ ready, qrDataUrl }`.
  - `GET /api/appointments?date=ISO` → citas del día (si no se pasa, usa fecha actual).
  - `GET /api/messages?limit=50` → últimos mensajes.

- CORS abierto para facilitar el frontend (`origin: '*'`).
- Lanza servidor en `config.port` y llama `startClient()`.

---

## 2. Frontend (Next.js 14 + Tailwind) – Dashboard

Directorio: `frontend`

### 2.1. Configuración básica

Archivos creados:

- `frontend/package.json`
  - Scripts: `dev`, `build`, `start`, `lint`.
- `next.config.mjs`
  - Activa `appDir`.
- `tailwind.config.ts`
  - Escanea `./app/**/*.{js,ts,jsx,tsx}` y `./components/**/*.{js,ts,jsx,tsx}`.
- `postcss.config.mjs`, `tsconfig.json`.
- `app/globals.css`
  - Tailwind base + fondo oscuro (`bg-slate-950`, `text-slate-50`).
- `app/layout.tsx`
  - Layout raíz en español.

### 2.2. Página de dashboard

Archivo `frontend/app/page.tsx`:

- Es un **client component** (`'use client'`) que:
  - Lee `API_BASE` de `process.env.NEXT_PUBLIC_API_BASE_URL` (o `http://localhost:4000` por defecto).
  - Hace `fetch` paralelo a:
    - `/api/whatsapp/status`
    - `/api/appointments`
    - `/api/messages?limit=50`
  - Refresca cada 30s y al pulsar el botón “Refrescar”.

**Secciones UI:**

- **Header**
  - Título “Dashboard Citas WhatsApp”.
  - Botón “Refrescar”.

- **Tarjetas de resumen**
  - **Estado de WhatsApp**
    - Muestra:
      - “Conectado” en verde (`ready=true`).
      - “No conectado” en ámbar.
    - Si no está conectado y hay `qrDataUrl`:
      - Muestra el QR como `<img src={status.qrDataUrl} />` para escanear desde navegador.
    - Si no hay QR aún:
      - Texto “Iniciando cliente...” / “esperando QR”.
  - **Resumen rápido**
    - Número de citas de hoy (tamaño de `appointments`).
    - Número de mensajes recientes (`messages.length`).

- **Tabla “Citas de hoy”**
  - Muestra:
    - Hora (`start_at` → `HH:MM`).
    - Nombre cliente (`customers.name` o “Sin nombre”).
    - Teléfono (`customers.phone`).
  - Mensaje “No hay citas hoy” si no hay resultados.

- **Lista “Últimos mensajes”**
  - Cada mensaje:
    - Quién habla: `Bot →` (verde) o `Cliente → Bot` (celeste).
    - Fecha/hora (`created_at` local).
    - Contenido (`content`).
    - Teléfono (`phone`).

Comandos básicos:

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

Configura en `.env.local` de `frontend`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

---

## 3. Schema de base de datos (Supabase / PostgreSQL)

Archivo: `database/schema.sql`

Tablas principales:

- **`customers`**
  - `id` `bigint` identity PK
  - `phone` `text not null unique`
  - `name` `text`
  - `notes` `text`
  - `created_at` `timestamptz default now()`

- **`messages`**
  - `id` `bigint` identity PK
  - `phone` `text not null`
  - `content` `text not null`
  - `from_me` `boolean not null default false`
  - `created_at` `timestamptz default now()`
  - Índices: por `created_at desc` y por `(from_me, created_at desc)`.

- **`appointments`**
  - `id` `bigint` identity PK
  - `customer_id` `bigint` FK → `customers(id)` (`on delete cascade`)
  - `start_at` `timestamptz not null`
  - `end_at` `timestamptz not null`
  - `google_event_id` `text`
  - `status` `text default 'confirmed'`
  - `source` `text default 'whatsapp'`
  - `created_at` `timestamptz default now()`
  - Índices en `start_at` y `(customer_id, start_at)`.

RLS activado (MVP):

```sql
alter table public.customers enable row level security;
alter table public.messages enable row level security;
alter table public.appointments enable row level security;
```

En Supabase puedes:

1. Ir a **SQL Editor** y ejecutar el contenido de `schema.sql`.
2. Crear **políticas** que permitan:
   - Lectura/escritura amplia para el rol `service_role` (tu backend).
   - (Opcional) Políticas más restringidas si algún día quieres exponer algo directo al frontend.

---

## 4. Instrucciones de deploy

### 4.1. Backend en Railway (similar para Render)

#### Paso 1 – Repositorio

1. Inicializa git en tu carpeta del proyecto (opcional pero recomendado).
2. Sube el repo a GitHub/GitLab.

#### Paso 2 – Proyecto en Railway

1. Entra en Railway.
2. Crea un **nuevo proyecto** → “Deploy from GitHub” → selecciona tu repo.
3. En Railway, configura el servicio que apunte a la carpeta `backend`:
   - Si el repo tiene un único `package.json` en `backend`, Railway suele detectarlo.
   - Si no, configura:
     - **Root Directory**: `backend`
     - **Build Command**: `npm install && npm run build` (en este caso sólo `npm install` basta).
     - **Start Command**: `npm start`.

4. **Variables de entorno** (en Railway → Variables):
   - `PORT` (Railway te da `PORT`; puedes usarlo directamente).
   - `WHATSAPP_SESSION_PATH=/app/.wwebjs_session`  *(por ejemplo)*.
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_CALENDAR_ID`
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`  *(pega la clave con `\n` como texto plano, Railway la conserva)*.
   - `MAX_MESSAGES_PER_DAY` (por ejemplo `80`).

#### Paso 3 – Persistencia de sesión de WhatsApp

- **Importante**: `LocalAuth` guarda la sesión en disco (`WHATSAPP_SESSION_PATH`).
- En Railway/Render, el sistema de archivos es **efímero**:
  - Si el contenedor se reinicia, se puede perder la carpeta.
- Opciones:
  - **MVP sencillo**: aceptar que si la instancia se reinicia tendrás que escanear QR de nuevo.
  - Solución más robusta (para más adelante):
    - Montar un **Volume/Persistent Disk** y apuntar `WHATSAPP_SESSION_PATH` a ese volumen.
    - O serializar la sesión en Supabase en vez de en disco (requeriría cambiar el código a un `RemoteAuth` casero).

Para el MVP, con `LocalAuth` + almacenamiento interno, ya cumples “sesión persistente” mientras el contenedor no se recrea.

#### Paso 4 – URL del backend

- Railway te dará una URL tipo `https://citas-backend.up.railway.app`.
- Guárdala para configurar el frontend (`NEXT_PUBLIC_API_BASE_URL`).

---

### 4.2. Backend en Render (alternativa rápida)

1. Crea un servicio **Web Service** desde tu repo.
2. En “Root Directory”: `backend`.
3. Build Command: `npm install`.
4. Start Command: `npm start`.
5. Añade las mismas variables de entorno descritas arriba.
6. Revisa logs para ver:
   - `"[API] Servidor escuchando en puerto ..."`
   - `"[WhatsApp] QR recibido..."` → entra a `/api/whatsapp/status` o mira logs para ver QR.

---

### 4.3. Frontend en Vercel

1. Entra en Vercel, importa el repo desde GitHub.
2. En configuración del proyecto:
   - **Root Directory**: `frontend`.
   - Vercel detectará automáticamente Next.js.
3. Variables de entorno (Vercel → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_BASE_URL=https://TU_BACKEND_HOST`  
     Ej: `https://citas-backend.up.railway.app`
4. Deploy:
   - Vercel construirá con `npm install` + `next build` y expondrá el dashboard.

---

### 4.4. Flujo final de uso

1. **Con backend corriendo** (local o en Railway/Render):
   - Shopify… (no se usa aquí, sólo backend)  
   - Abre el dashboard (`http://localhost:3000` en dev, o URL Vercel).
   - En la tarjeta de **Estado de WhatsApp**, verás:
     - “No conectado” y un QR cuando el cliente emita `qr`.
2. Escanea el **QR** con tu WhatsApp (como si fuera WhatsApp Web).
3. El estado pasará a “Conectado” y el QR desaparecerá.
4. Envía desde tu móvil:
   - `AYUDA` → ves comandos.
   - `DISPONIBLE 2026-02-28` → huecos.
   - `CITA 2026-02-28 10:00` → se crea evento en Google Calendar y cita en Supabase.
5. En el dashboard:
   - Verás la cita en “Citas de hoy” (si es el mismo día).
   - Verás los mensajes en “Últimos mensajes”.

---

### 5. Próximos pasos / mejoras posibles

- **Persistir sesión WhatsApp en BD** en vez de disco para resistir reinicios.
- Añadir **autenticación simple** al dashboard (por ahora está abierto).
- Añadir **formulario manual** de creación de citas desde el dashboard (no sólo vía WhatsApp).
- Pulir **políticas RLS** en Supabase para mayor seguridad.

Si quieres, en el siguiente paso puedo:

- Ajustar el flujo de keywords (por ejemplo, aceptar formato en español tipo “hoy a las 10:00”).
- Implementar guardado de sesión de WhatsApp en Supabase en lugar de `LocalAuth`.

