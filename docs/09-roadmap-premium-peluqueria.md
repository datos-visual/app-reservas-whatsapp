# 09 — Roadmap Premium (vertical peluquería) y motor proactivo

> **Estado:** evaluado y diseñado, NO aprobado para implementar (17-jul-2026).
> Ideas del fundador valoradas una a una. Cualquier conversación futura que
> implemente algo de aquí debe respetar los **principios inviolables** del §1
> y el orden recomendado del §5. Complementa al doc 08 (bloques B1-B7): nada
> de este documento sustituye ese plan; se intercala tras B3/B4.

---

## 1. Principios inviolables para TODO lo premium

1. **No tocar el núcleo que funciona.** Cada mejora es un módulo separado
   (fichero propio en `backend/src/`) con **flag por tienda, OFF por defecto**.
   Si el flag está apagado, el código nuevo NO se ejecuta: el bot se comporta
   exactamente igual que hoy. Así una tienda sin premium es idéntica a la
   actual y un fallo del módulo nuevo nunca rompe la reserva básica.
2. **Flags en BD, no en env:** tabla/columna `stores.premium_features` (JSONB,
   p. ej. `{"smart_slots": true, "waitlist": false}`) o tabla `store_features`.
   El panel del negocio (y el admin) los activa/desactiva. Esto ES la
   paquetización: un plan = un conjunto de flags.
3. **Restricción física de WhatsApp (afecta a las ideas 2, 4 y 6):** fuera de
   la ventana de 24 h desde el último mensaje del cliente, Meta **solo permite
   plantillas pre-aprobadas** (con variables), nunca texto libre. El mensaje
   "ultra-personalizado por IA" NO es posible tal cual; SÍ lo es una plantilla
   con huecos: `¡Hola {{1}}! Hace tiempo que no nos vemos para {{2}}…
   {{3}} tiene hueco el {{4}}. ¿Te lo reservo?` — el resultado percibido es
   casi el mismo y además es determinista (regla del proyecto: la IA solo
   interpreta, nunca redacta mensajes salientes).
4. **Coste acotado por diseño (regla 8 de INSTRUCCIONES):** todo envío
   proactivo pasa por cupos mensuales por tienda, dedupe, horario silencioso y
   opt-out — los mismos guardas ya probados del módulo missed-call. Plantillas
   marketing en España ≈ céntimos por mensaje: un solo Tinte recuperado (45 €)
   paga cientos de envíos, pero el cupo evita sustos y protege lo siguiente ↓
5. **El riesgo real de las campañas no es el coste: es el *quality rating* de
   Meta.** Si los clientes marcan los mensajes como spam, Meta degrada o
   BLOQUEA el número de WhatsApp de la tienda → se cae también el bot de
   reservas (¡el producto core!). Por eso: consentimiento explícito registrado,
   opt-out en cada plantilla marketing, cupos duros y empezar con volúmenes
   mínimos.
6. **Detección siempre determinista (SQL/luxon), nunca "IA que decide":**
   ciclos de visita, huecos adyacentes, candidatos a campaña… todo se calcula
   con queries sobre `appointments`/Calendar. Coste cero, comportamiento
   auditable, sin dependencia de proveedores.
7. **Pensado para todos los verticales:** el "motor proactivo" del §4 sirve
   igual para recompra de ITV (taller, ya previsto en B7), reactivación de
   comensales (restaurante) o antiguos huéspedes (rural). Se construye UNA vez.

---

## 2. Valoración idea a idea

| # | Idea | Valor | Riesgo | Coste var. | Esfuerzo | Veredicto |
|---|---|---|---|---|---|---|
| P1 | Compactar agenda (huecos adyacentes) | Alto | Casi nulo | 0 € | Horas | ✅ Hacer primero |
| P2 | Reactivación por ciclo ("María") | Muy alto | Medio (quality) | céntimos/msg | Medio | ✅ Estrella premium |
| P3 | Lista de espera | Alto | Bajo | céntimos/msg | Medio-bajo | ✅ Hacer pronto |
| P4 | Modo Oferta (última hora) | Medio | **Alto** (spam/quality) | céntimos×N | Medio | ⚠️ Rediseñar y posponer |
| P5 | Ficha de estilo con fotos | Medio (fidelización) | Bajo (RGPD a cuidar) | ~0 € (storage) | Medio | 🟡 Diferencial, no urgente |
| P6 | Venta cruzada post-servicio 48 h | Medio-alto | Medio (quality) | céntimos/msg | Bajo (si existe P2) | ✅ Con el motor de P2 |
| P0 | Onboarding por chat en la web | Medio | Nulo (no toca bot) | 0 € | Medio | 🟡 Encaja en B6 |

### P1 — Compactación de agenda (huecos pegados a citas existentes)
- **Qué es técnicamente:** NO cambia qué huecos existen, solo **el orden en
  que se ofrecen**: al generar slots, puntuar cada uno por adyacencia a
  eventos ya ocupados (termina justo antes de una cita o empieza justo
  después) y listar primero los mejor puntuados. Cambio quirúrgico en
  `sendSlotList`/`generateSlots` tras el flag `smart_slots`.
- **Por qué es la primera:** valor real para el negocio (agenda compactada =
  menos horas muertas), coste cero, imposible que rompa nada (con flag OFF el
  orden es el actual), y demo visual potente para vender el premium.
- **Matiz UX:** "sutil" = ordenar, no ocultar. Nunca esconder huecos válidos.
- **DoD:** con dos citas en Calendar, la lista ofrece primero los huecos
  contiguos; con flag OFF, orden cronológico de siempre.

### P2 — Reactivación por ciclo de visita ("María se teñía cada 15 días")
- **Detección (determinista, sin IA):** por (customer, service), mediana de
  los intervalos entre citas completadas (mín. 3 citas para tener patrón).
  Si `hoy - última_cita > factor × mediana` (p. ej. 2×) → candidata.
  Query SQL nocturna vía el cron existente; tabla `reactivation_candidates`
  con estado para no insistir (máx. 1 mensaje por ciclo, cooldown 30-60 días).
- **Envío:** plantilla **marketing** con variables (nombre, servicio, día/hora
  del primer hueco real sacado de Calendar) + botón [Reservar] que entra al
  flujo guiado B2 con el servicio preseleccionado + botón [No, gracias]
  (opt-out ya existente). Horario silencioso y cupo mensual del motor §4.
- **Requisitos de compliance:** columna de consentimiento marketing en
  `customers` (se pide una vez, en conversación activa: "¿Quieres que te
  avise cuando te toque el color?"). Sin consentimiento, no hay envío. RGPD
  y reglas de Meta cubiertos a la vez.
- **Nota Calendar:** el histórico útil es el de `appointments` (tiene
  servicio y cliente vinculados); el histórico de Google Calendar previo a la
  app no identifica clientes de forma fiable — no prometer "análisis de todo
  el histórico previo" en la venta.
- **Por qué es la estrella:** ingresos recurrentes medibles para la
  peluquería (la métrica "citas recuperadas ≈ X €" ya existe en missed-call y
  se replica aquí). Es EL argumento del plan premium.

### P3 — Lista de espera
- **Diseño:** tabla `waitlist` (store_id, customer_id, service_id, fecha o
  franja deseada, estado, created_at). Cuando no hay huecos, el bot ofrece
  "¿Te apunto y te aviso si se libera algo?". Al cancelarse una cita
  (webhook/flujo ya existente), hook que busca al primero de la lista cuyo
  servicio cabe en el hueco liberado → aviso. Dentro de 24 h de conversación:
  gratis; fuera: plantilla utility (más barata que marketing y sin riesgo
  reputacional). El hueco NO se bloquea: el primero que confirma se lo lleva
  (el anti doble-reserva ya resuelve la carrera).
- **Riesgo bajo:** módulo aditivo, hook envuelto en try/catch — si falla, la
  cancelación sigue funcionando como hoy.

### P4 — Modo Oferta (última hora) ⚠️
- **La idea es buena pero, tal cual, es la más peligrosa:** una campaña
  masiva de marketing es exactamente lo que degrada el quality rating y puede
  tumbar el número (§1.5). Además "clientes del barrio con horarios
  flexibles" requiere datos que no existen (dirección, flexibilidad).
- **Rediseño seguro (v1):** el botón "Modo Oferta" del panel envía SOLO a
  (a) la lista de espera de P3 y (b) clientes con consentimiento marketing y
  visita reciente, con **cupo duro** (p. ej. 15 envíos/día) y plantilla con
  opt-out. Segmentación "flexible" v2: deterministicamente, clientes con
  citas históricas en horas valle.
- **Orden:** el último. Necesita P3 + P2 (consentimiento) ya rodados.

### P5 — Ficha de estilo con fotos
- **Técnica:** el webhook ya recibe mensajes; hay que aceptar `type: image`,
  descargar el binario de la Graph API (las URLs de Meta caducan) y guardarlo
  en **Supabase Storage** (1 GB free tier; después céntimos/GB) en ruta
  `store_id/customer_id/`. Vista en el panel (galería por cliente) + campo de
  notas del estilista (que además alimenta P6).
- **RGPD:** las fotos son datos personales — consentimiento al pedirla,
  política de retención y borrado a petición. Añadir al aviso de privacidad
  de Fase B (§7.3 de VISION).
- **Valor:** fidelización y barrera de salida (la ficha vive en la pelu).
  No urgente: hacer cuando P1-P3 estén vendidas.

### P6 — Venta cruzada post-servicio (48 h)
- **Con el motor de P2 construido, esto es barato:** otro "trigger" del mismo
  motor (evento: cita completada + 48 h) con plantilla marketing propia y las
  notas del estilista (campo del panel, P5) como variable. Misma mecánica de
  consentimiento, cupos y opt-out.
- **Recomendación de producto:** empezar como "interés por el resultado"
  (utility-like, genera respuestas y reabre la ventana de 24 h donde ya se
  puede conversar y recomendar producto gratis) y solo después meter la venta.

### P0 — Onboarding conversacional en la web
- **Valorado:** sí, pero **híbrido y determinista**: un asistente tipo chat
  con pasos guiados (botones + campos inline), NO un LLM libre — los datos de
  onboarding son estructurados (nombre, timezone, calendar ID, token) y un
  chat libre añade coste y errores donde un paso guiado es más rápido.
  Es exactamente el **configurador guiado de vertical** ya previsto como B6
  (pieza de producto, VISION §2): elegir vertical → semilla de servicios →
  ajustar precios/duraciones conversando con botones. Cero riesgo (solo
  frontend + endpoints ya existentes).

---

## 3. Paquetización propuesta (mapea a la página de precios actual)

| Plan (precio actual) | Flags incluidos |
|---|---|
| **Acceso inicial** (15,95 €) | Core: bot + flujo guiado + recordatorios + panel |
| **Implantación guiada** (39,95 €) | + `smart_slots` (P1) + `waitlist` (P3) |
| **Premium vertical** (nuevo, ~59-69 € o add-on) | + `reactivation` (P2) + `post_sale` (P6) + `style_file` (P5) + `flash_offers` (P4, con cupos) |
| **Multi-sede** (consultar) | Todo + límites ampliados |

- Los envíos de plantillas marketing van **incluidos hasta el cupo** del plan
  (p. ej. 100/mes); por encima, no se envían (nunca sorpresa de coste — ni
  para la tienda ni para nosotros).
- Cada flag es independiente: se puede regalar uno a un piloto sin darle el
  paquete entero.

## 4. Motor proactivo único (infra común de P2/P4/P6 + B7)

No construir tres sistemas de envío: UNO, calcado de los patrones YA probados
de `missedCall.js` y `reminders.js`:

```
disparadores (cron 15 min, deterministas)
  ├─ ciclo de visita vencido (P2)
  ├─ cita completada + 48 h (P6)
  ├─ hueco liberado → lista de espera (P3, también por hook directo)
  └─ modo oferta activado (P4)
        ↓
cola en tabla (proactive_messages: pending/sent/skipped + motivo)
        ↓
comprobaciones en orden anti-coste (idénticas a missed-call):
  flag activo → plantilla aprobada → consentimiento → no opt-out
  → horario silencioso → cupo mensual → dedupe/cooldown → enviar
        ↓
atribución: respuesta ≤48 h / cita creada ≤48 h → métrica "€ generados"
```

Tablas nuevas: `proactive_messages`, `reactivation_candidates`, `waitlist`,
+ columna `customers.marketing_consent_at` (null = no) + flags en `stores`.
**Ninguna tabla ni columna existente se modifica** (solo adiciones idempotentes).

## 5. Orden recomendado de implementación

1. **P1** `smart_slots` (horas, riesgo cero, demo vendedora) — puede ir ya.
2. Infra de flags `premium_features` + panel de activación (base de todo).
3. **P3** lista de espera (módulo aislado, plantilla utility).
4. **Motor proactivo** + consentimiento marketing (§4).
5. **P2** reactivación (la estrella; requiere 4).
6. **P6** post-servicio (barato tras 5).
7. **P5** ficha de estilo (storage + panel).
8. **P4** modo oferta v1 restringida (la última, con P3+consentimiento rodados).

Intercalado con el plan vigente: B3/B4 (doc 08) siguen siendo lo inmediato;
P1 y la infra de flags pueden entrar en cualquier momento por ser inocuos.

## 6. Qué NO hacer (trampas detectadas en la evaluación)

- ❌ Texto libre generado por IA en mensajes salientes proactivos (imposible
  fuera de 24 h; y dentro, contra la regla "la IA solo interpreta").
- ❌ Campañas sin consentimiento registrado o sin cupo duro.
- ❌ Ocultar huecos al compactar agenda (solo reordenar).
- ❌ Bloquear huecos para la lista de espera (romperíamos disponibilidad).
- ❌ Prometer análisis del histórico de Calendar pre-app (no identifica
  clientes de forma fiable; el patrón sale de `appointments`).
- ❌ Tocar el índice anti doble-reserva o el flujo de confirmación SI/NO.
