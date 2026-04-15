# Known Issues and Fixes

## WhatsApp tokens con espacios
Síntoma:
- 401 al enviar mensajes

Solución:
- limpiar token en BD
- normalizar en backend con replace(/\s+/g, '')

## Timezone en disponibilidad
Síntoma:
- horas mostradas desplazadas
- huecos mal presentados

Solución:
- usar Luxon
- no usar JS Date + getHours()/getMinutes()
- trabajar con startIso/endIso/label en timezone de tienda

## customers con unicidad global
Síntoma:
- duplicate key por phone al probar multi-tienda

Solución:
- unicidad por (store_id, phone)
- createOrGetCustomer siempre por store_id + phone

## appointments.source
Síntoma:
- insert falla por constraint

Solución:
- usar 'whatsapp' en lugar de 'whatsapp_cloud'

## Test business phone number
Síntoma:
- comportamiento inestable de recepción
- pruebas no fiables

Solución:
- no basar validación final en el test number
- pasar a número real para seguir