# Database Notes

## Tablas principales
- stores
- whatsapp_accounts
- calendar_connections
- customers
- messages
- appointments
- conversation_state
- store_users (si aplica)

## Regla importante
stores.id es la PK real.

## customers
- No debe existir unicidad global por phone
- La unicidad correcta es (store_id, phone)

## appointments
- source debe ser 'whatsapp' o 'admin'
- Debe existir protección contra doble reserva
- Índice único recomendado:
  (store_id, start_at) WHERE status = 'confirmed'

## messages
- Deben guardarse inbound y outbound
- Deben incluir store_id
- Conviene mantener message_id para idempotencia