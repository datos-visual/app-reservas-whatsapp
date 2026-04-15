# Architecture Rules

## Multi-tenant
- store_id nunca lo aporta el usuario por WhatsApp
- store_id se resuelve desde:
  metadata.phone_number_id -> whatsapp_accounts.phone_number_id -> store_id

## Stores
- La PK real de stores es stores.id
- Las tablas hijas usan store_id como FK hacia stores.id

## Calendar
- GOOGLE_CLIENT_EMAIL y GOOGLE_PRIVATE_KEY son globales
- Todas las tiendas comparten su calendario con la misma service account
- Cada tienda tiene su google_calendar_id en calendar_connections
- Nunca hardcodear calendarId en código

## WhatsApp
- El access_token es por tienda y vive en whatsapp_accounts
- No guardar tokens de WhatsApp en Render como secreto global de negocio
- Normalizar siempre el token con eliminación de whitespace

## Estado
- Backend stateless
- Estado conversacional en conversation_state
- Nunca guardar estado en memoria