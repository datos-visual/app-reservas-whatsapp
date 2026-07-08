# Módulo "Llamada perdida → WhatsApp" (missed-call)

## Qué hace

Cuando un cliente llama al negocio y nadie contesta, la llamada se desvía
(desvío condicional de la operadora) a un número virtual (DID) del sistema.
El backend registra la llamada, responde una locución breve y envía al
llamante una plantilla de WhatsApp con botones para reservar. La respuesta
del cliente entra en el flujo conversacional existente.

## Cadena multi-tenant (no romper)

```
llamada → DID (campo To del webhook de voz)
       → store_phone_numbers (did_e164, is_active=true)
       → store_id
       → missed_calls / missed_call_settings / whatsapp_accounts / ...
```

El `store_id` JAMÁS llega del exterior. Un DID pertenece a una sola tienda
(índice único global sobre `did_e164`).

## Piezas

| Pieza | Fichero | Qué hace |
|---|---|---|
| Webhook de voz | `index.js` → `POST /webhook/voice/twilio` | Firma Twilio (HMAC-SHA1 sobre `PUBLIC_BASE_URL` + params), TwiML (locución <10 s + colgar), registro en background |
| Proveedor voz | `providers/twilioVoice.js` | Interfaz: verifySignature / parseIncomingCall / buildTwiml. Otros proveedores SIP deben implementarla |
| Motor de envío | `missedCall.js` → `processMissedCallSend` | Orden: disabled → template_not_approved → expired(>48 h) → optout → horario silencioso → cupo mensual → cuenta WhatsApp → dedupe → envío |
| Despachador | `POST /internal/missed-calls/dispatch` | Lo invoca un cron EXTERNO gratuito (cron-job.org, cada 15 min) con cabecera `x-internal-token`. Procesa los `pending` (horario silencioso) |
| Plantilla | `whatsappCloud.js` → `sendTemplateMessage` | Plantilla UTILITY con 3 botones quick-reply (payloads `MISSED_CALL_BOOK/CALLBACK/OPTOUT`) |
| Botones | `index.js` → `handleMissedCallButton` | Reservar → instrucciones; Que me llamen → `callback_requested`; No gracias → opt-out |
| Atribución | `missedCall.js` | Respuesta ≤48 h → `resulted_in_conversation`; cita confirmada ≤48 h → `resulted_in_booking_id` (métricas en € con `ticket_medio_eur`) |

## Garantías anti-coste y anti-abuso

- **Idempotencia webhook voz:** índice único parcial `(provider, provider_call_id)` — los reintentos de Twilio no duplican.
- **Dedupe:** 1 plantilla por `(store_id, teléfono)` por DÍA NATURAL local — PK compuesta en `missed_call_sends` + captura 23505. Si Meta rechaza el envío, el cupo del día se libera.
- **Cupo mensual:** `missed_call_settings.monthly_quota` (def. 100), mes natural en timezone de tienda.
- **Horario silencioso:** `quiet_start`/`quiet_end` (def. 21:00-09:00) hora LOCAL; cruza medianoche correctamente. Las llamadas quedan `pending` y las despacha el cron.
- **Opt-out permanente:** botón "No, gracias" (payload) o palabra `BAJA`. El `NO` textual NO da de baja (significa cancelar reserva pendiente).
- **Anónimas:** se registran (`skipped/anonymous`), nunca se contacta.
- **Caducidad:** `pending` >48 h → `skipped/expired`.

## Estados de missed_calls

`status`: `pending` (en cola) · `sent` · `skipped`.
`skip_reason`: quota_exceeded · optout · anonymous · disabled ·
template_not_approved · dedupe_24h · no_whatsapp_account · send_failed · expired.

## Variables de entorno

| Variable | Uso |
|---|---|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Cuenta Twilio (firma del webhook) |
| `PUBLIC_BASE_URL` | URL pública exacta del backend (necesaria para la firma tras el proxy de Render) |
| `INTERNAL_CRON_TOKEN` | Autenticación del despachador |

## Alta de una tienda en el módulo (semimanual Fase 1)

1. **Día 0 — pedir la plantilla en Meta** (tarda 24-72 h; hacerlo SIEMPRE primero):
   WhatsApp Manager → Plantillas → Crear: nombre `canalagenda_missed_call_v1`,
   categoría **Utilidad**, idioma **es**, cuerpo:
   «Hola, soy el asistente de {{1}}. Hemos visto tu llamada y no pudimos
   atenderte. ¿Quieres reservar una cita o que te llamemos?»
   Botones quick-reply: `Reservar cita` · `Que me llamen` · `No, gracias`.
2. Comprar DID español (Twilio → Buy a Number, capacidad Voice; requiere
   regulatory bundle) y apuntar su voice webhook a
   `https://BACKEND/webhook/voice/twilio` (POST).
3. SQL:
   ```sql
   insert into store_phone_numbers (store_id, did_e164) values ('STORE', '+34...');
   insert into missed_call_settings (store_id, enabled, business_name, ticket_medio_eur)
   values ('STORE', true, 'Nombre del negocio', 30.00);
   ```
4. Cuando Meta apruebe: `update missed_call_settings set template_status='approved' where store_id='STORE';`
   (El estado `pending/approved` es visible para gestionar la expectativa
   comercial: "instalado hoy, activo en 48-72 h".)
5. El cliente activa el desvío condicional (ver `onboarding-desvio-llamadas.md`).

## Checklist de pruebas

- [ ] Llamada al DID sin contestar → locución → fila en `missed_calls` → plantilla recibida.
- [ ] Segunda llamada el mismo día → fila nueva pero `skipped/dedupe_24h`.
- [ ] Llamada con número oculto → `skipped/anonymous`, sin envío.
- [ ] Llamada a las 22:00 → `pending`; a las 09:0x el cron la envía.
- [ ] Botón "No, gracias" → fila en `contact_optouts`; siguiente llamada → `skipped/optout`.
- [ ] `BAJA` por texto → opt-out. `NO` con reserva pendiente → solo cancela la reserva.
- [ ] Reservar tras la plantilla → `resulted_in_booking_id` relleno.
- [ ] `curl -X POST .../webhook/voice/twilio -d "To=+34..."` sin firma → 403.
- [ ] DID desconocido → TwiML de colgar + warn en logs, sin registro.
- [ ] Despachador sin token → 401; con token → JSON de resumen.

## Costes por tienda (orden de magnitud, verificar precios vigentes)

DID ~1-1,5 €/mes + ~0,01 €/llamada capturada (locución <10 s) +
0,02-0,08 €/plantilla. Con cupo 100/mes: ~2-4 €/mes. El plan de venta del
módulo debe incluir cupo y repercutir excesos (regla de costes del proyecto).
