## Backend (Node/Express)

- **Instalación**:
  - `cd backend`
  - `npm install`
- **Desarrollo**:
  - `npm run dev` → arranca la API + cliente de WhatsApp (con `nodemon`).
- **Producción**:
  - `npm start`

### Variables de entorno backend

- **SUPABASE_URL**: URL de tu proyecto Supabase.
- **SUPABASE_SERVICE_ROLE_KEY**: clave `service_role` para acceso desde el backend.
- **GOOGLE_CALENDAR_ID**: ID del calendario donde se crean las citas.
- **GOOGLE_CLIENT_EMAIL**: email del servicio de Google (Service Account).
- **GOOGLE_PRIVATE_KEY**: clave privada del servicio (usa `\n` para saltos de línea).
- **PORT**: puerto HTTP del backend (por defecto `4000`).
- **WHATSAPP_SESSION_PATH**: carpeta donde se guarda la sesión de WhatsApp.
- **MAX_MESSAGES_PER_DAY**: límite de mensajes de salida por número y día (por defecto `80`).
- **ADMIN_TOKEN**: token de administrador para proteger las rutas `/api/*`.
- **DASHBOARD_ORIGIN**: origen permitido para CORS (por defecto `http://localhost:3000` en desarrollo).
- **TZ**: zona horaria backend (por defecto `Europe/Madrid`).

## Frontend (Next.js)

- **Instalación**:
  - `cd frontend`
  - `npm install`
- **Desarrollo**:
  - `npm run dev` (Next.js en `http://localhost:3000`).

### Variables de entorno frontend

- **NEXT_PUBLIC_API_BASE_URL**: URL base de la API backend (por defecto `http://localhost:4000`).
- **NEXT_PUBLIC_ADMIN_TOKEN**: token de administrador opcional para inyectar por defecto en el dashboard (se puede sobrescribir desde el propio panel y se guarda en `localStorage`).

