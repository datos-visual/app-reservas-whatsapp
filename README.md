## Backend (Node/Express)

- **Instalación**:
  - `cd backend`
  - `npm install`
- **Desarrollo**:
  - `npm run dev` → arranca la API (con `nodemon`).
- **Producción**:
  - `npm start`

### Arquitectura (WhatsApp Cloud API, multi-tenant)

Este backend recibe mensajes de WhatsApp mediante **Webhook** (Meta) y responde enviando mensajes por **WhatsApp Cloud API (Graph API)**.

- **Multi-tenant**: toda la lógica usa `store_id`.
- **Mapeo tienda**: cada mensaje entrante se asigna a su tienda usando `phone_number_id` → tabla `whatsapp_accounts`.
- **Google Calendar multi-tenant**: el calendario por tienda se lee desde `calendar_connections.google_calendar_id`.
- **Render free / sin disco persistente**: no se usa `whatsapp-web.js`, QR, ni sesiones en disco.

### Variables de entorno backend

- **SUPABASE_URL**: URL de tu proyecto Supabase.
- **SUPABASE_SERVICE_ROLE_KEY**: clave `service_role` para acceso desde el backend.
- **GOOGLE_CLIENT_EMAIL**: email del servicio de Google (Service Account).
- **GOOGLE_PRIVATE_KEY**: clave privada del servicio (usa `\n` para saltos de línea).
- **PORT**: puerto HTTP del backend (por defecto `4000`).
- **MAX_MESSAGES_PER_DAY**: límite de mensajes de salida por número y día (por defecto `80`).
- **ADMIN_TOKEN**: token de administrador para proteger las rutas `/api/*`.
- **DASHBOARD_ORIGIN**: origen permitido para CORS (por defecto `http://localhost:3000` en desarrollo).
- **TZ**: zona horaria backend (por defecto `Europe/Madrid`).
- **WHATSAPP_WEBHOOK_VERIFY_TOKEN** o **GLOBAL_WEBHOOK_VERIFY_TOKEN**: token para validar el GET `/webhook` (verificación de Meta).
- **META_APP_SECRET**, **WHATSAPP_APP_SECRET** o **APP_SECRET**: secreto de la app de Meta para validar la firma `X-Hub-Signature-256` en el POST `/webhook` (recomendado en producción).
- **META_GRAPH_API_VERSION**: versión de la Graph API (opcional, por defecto `v22.0`).

### Setup por tienda (Supabase)

Para cada tienda necesitas:

- Una fila en `stores`
- Una fila en `whatsapp_accounts` con:
  - `store_id`, `phone_number_id`, `access_token`, `verify_token` (opcional), `is_active=true`
- Una fila en `calendar_connections` con:
  - `store_id`, `google_calendar_id`, `mode`

### Webhook de WhatsApp (Meta)

- **GET** `/webhook`: verificación (Meta envía `hub.challenge`).
- **POST** `/webhook`: recepción de mensajes.

El handler responde **200 rápidamente** y procesa los mensajes sin colas (en serie).

### Nota sobre `whatsappClient.js` (deprecado)

El archivo `backend/src/whatsappClient.js` pertenecía al MVP con `whatsapp-web.js` (QR + LocalAuth). Se mantiene en el repo como referencia, pero **ya no se usa** en esta arquitectura.

## Frontend (Next.js)

- **Instalación**:
  - `cd frontend`
  - `npm install`
- **Desarrollo**:
  - `npm run dev` (Next.js en `http://localhost:3000`).

### Variables de entorno frontend

- **NEXT_PUBLIC_API_BASE_URL**: URL base de la API backend (por defecto `http://localhost:4000`).
- **NEXT_PUBLIC_ADMIN_TOKEN**: token de administrador opcional para inyectar por defecto en el dashboard (se puede sobrescribir desde el propio panel y se guarda en `localStorage`).

