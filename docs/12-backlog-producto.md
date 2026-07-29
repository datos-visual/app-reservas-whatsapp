# 12 — Backlog de producto: de "funciona" a "vendible"

> Inventario completo y priorizado (28-jul-2026). Recoge lo que pidió el
> fundador (equipo por día y habilidades, mensajes personalizables) **y lo que
> falta aunque nadie lo haya pedido todavía**, que suele ser lo que hace
> fracasar un piloto. Cada punto lleva esfuerzo (S = horas · M = 1-2 sesiones ·
> L = varias sesiones), riesgo y dependencias.
>
> **Decisión vigente:** el alta de tiendas es **manual y asistida** hasta las
> 10 primeras (guion en `docs/11`). Nada de este backlog cambia eso; lo que sí
> cambia es que **la tienda debe poder gestionar su día a día sin llamarte**.

---

## Bloque 1 — Sin esto no puedes tener un piloto real (crítico)

Hoy una peluquería no puede operar sola: su horario y sus citas manuales
dependen de ti y de SQL. Esto es lo primero.

| # | Funcionalidad | Por qué | Esfuerzo |
|---|---|---|---|
| 1.1 | **Horario del negocio editable en el panel** (apertura/cierre por día, días de cierre) | Hoy está en la BD y lo tocas tú. Es lo primero que quiere cambiar cualquier tienda | M |
| 1.2 | **Cierres puntuales y vacaciones** (rango de fechas cerrado) | Festivo local, semana de vacaciones. Sin esto el bot sigue dando citas en agosto | M |
| 1.3 | **Crear cita manual desde el panel** | La mitad de las clientas entran por la puerta o llaman. Si esas citas no están en el sistema, el bot ofrece huecos ocupados y se lía | M |
| 1.4 | **Mover / cancelar cita desde el panel, avisando al cliente** | Si la peluquera se pone enferma, hoy no hay forma de avisar. Debe salir un WhatsApp automático | M |
| 1.5 | **Bloquear un hueco** (comida, formación, recado) | Alternativa: lo hacen en Google Calendar (ya funciona). Con multi-empleado deja de bastar | S |
| 1.6 | **Antelación mínima para reservar y para cancelar** | "No reservas con menos de 2 h" / "no cancelas con menos de 24 h". Petición universal del sector | S |
| 1.7 | **Vista de agenda del día** en el panel | La pantalla que la tienda mirará 20 veces al día | M |

## Bloque 2 — Equipo y disponibilidad real (lo que pediste; = B5 ampliado)

Este bloque cambia el corazón del cálculo de huecos. Es el más delicado del
proyecto y **exige un cambio arquitectónico** (ver §"Nota técnica" abajo).

| # | Funcionalidad | Detalle | Esfuerzo |
|---|---|---|---|
| 2.1 | **Panel de equipo** (`/equipo`) | Alta/baja de profesionales; la tabla `resources` ya existe | M |
| 2.2 | **Turnos por profesional** | Quién trabaja cada día y en qué horas (Laura L-V mañanas, Marta X-S tardes) | M |
| 2.3 | **Ausencias** | Vacaciones, baja, día libre puntual. Restan capacidad ese día | M |
| 2.4 | **Habilidades** (qué servicios sabe hacer cada quien) | La novata no hace mechas → las mechas solo se ofrecen cuando está la veterana | M |
| 2.5 | **Capacidad por franja** | A las 10:00 hay 2 personas → 2 citas simultáneas; a las 17:00 solo 1 | L |
| 2.6 | **Asignación de profesional** | "¿Con quién?" [Cualquiera / Laura / Marta] y asignación automática al primero libre que sepa hacerlo | M |
| 2.7 | **Migración consciente del índice anti doble-reserva** | `(store_id, coalesce(resource_id,0), start_at)` — sin el `coalesce`, las tiendas de una sola persona **perderían** la protección | S pero CRÍTICO |
| 2.8 | **Evento de Calendar con profesional** | "Laura · Tinte — María (+34…)" para que se entienda la agenda compartida | S |

### Nota técnica imprescindible (leer antes de implementar el bloque 2)

Hoy la disponibilidad se calcula **mirando Google Calendar**: si hay un evento
solapando, el hueco está ocupado. Con varias profesionales eso deja de servir,
porque un evento no dice *quién* está ocupado.

**Modelo nuevo propuesto:**
- La ocupación **por profesional** sale de **nuestra base de datos**
  (`appointments.resource_id`), que es la única que sabe quién atiende qué.
- Google Calendar pasa a ser **espejo + bloqueos externos**: los eventos
  creados a mano (que no correspondan a una cita nuestra) restan una plaza de
  la capacidad de esa franja.
- Un hueco existe para un servicio si **hay al menos una profesional** que
  (a) sabe hacerlo, (b) está de turno, (c) no está ausente y (d) no tiene otra
  cita solapando.

Es un cambio de fondo, reversible por diseño: mientras una tienda no tenga
profesionales dadas de alta, el cálculo debe seguir dando **exactamente** el
resultado de hoy (capacidad 1, sin recursos). Ese es el criterio de
aceptación no negociable.

## Bloque 3 — Mensajes personalizables por tienda (lo que pediste)

Hay que separar dos cosas que se confunden:

**3.A — Textos del bot** (los escribe nuestro código, van dentro de la ventana
de 24 h, son gratis y los controlamos nosotros).
Hoy están fijos en `index.js`: el saludo, "¿Qué servicio quieres reservar?",
la confirmación, "no queda hueco"… Todas las tiendas suenan igual.

| # | Funcionalidad | Esfuerzo |
|---|---|---|
| 3.A.1 | Tabla `store_messages` (clave → texto) con **fallback al texto por defecto** del código si la tienda no lo ha personalizado | M |
| 3.A.2 | Variables seguras en los textos: `{negocio}`, `{cliente}`, `{servicio}`, `{fecha}`, `{hora}`, `{precio}` | S |
| 3.A.3 | Pantalla en el panel para editarlos, con vista previa y botón "restaurar el original" | M |
| 3.A.4 | Empezar por los **10 mensajes clave** (saludo, menú, pedir servicio, pedir día, sin huecos, resumen, confirmación, cancelación, despedida, no entendido) y no más | — |

**3.B — Plantillas de Meta** (las que salen fuera de la ventana de 24 h:
recordatorios, lista de espera, llamada perdida). Aquí **el texto lo aprueba
Meta y vive en la cuenta de CADA tienda** — no podemos escribirlo nosotros al
vuelo. Lo que sí falta:

| # | Funcionalidad | Esfuerzo |
|---|---|---|
| 3.B.1 | Que cada tienda tenga **su nombre de plantilla** configurable desde `/admin` (el backend ya lo acepta; falta el campo en pantalla) | S |
| 3.B.2 | **Catálogo oficial de textos** de plantilla para que cada tienda cree las suyas idénticas (ya empezado en `docs/11` §Bloque 6) | S |
| 3.B.3 | Aviso en `/admin` si una tienda tiene el módulo activo con la plantilla sin aprobar (ya existe) + **fecha de envío a revisión** para saber a quién perseguir | S |

⚠️ Lección aprendida: **el texto de los botones de plantilla se fija al
crearla en Meta**; nosotros solo mandamos las acciones por posición. Si el
texto se escribe mal ("Confirmar cita" en vez de "Cancelar cita"), el botón
funciona pero confunde. Hay que revisarlo en el alta.

## Bloque 4 — Producto y negocio (para cobrar y para dormir tranquilo)

| # | Funcionalidad | Por qué | Esfuerzo |
|---|---|---|---|
| 4.1 | **Última ejecución del planificador visible en `/admin`** | El 28-jul el cron llevaba semanas muerto en silencio. Nunca más | S |
| 4.2 | **Alertas al admin** (email) si una tienda tiene token por caducar, bot sin responder o plantilla sin aprobar | Detectar antes de que llame el cliente | M |
| 4.3 | **Métricas para la tienda**: citas del mes, no-shows, % de confirmación, huecos recuperados, € estimados | Es el argumento de renovación a los 60 días del piloto | M |
| 4.4 | **Ficha de cliente**: histórico de visitas, notas, teléfono, buscador | Base de la fidelización y de P2/P5 (doc 09) | M |
| 4.5 | **Multi-usuario por tienda** (dueña + recepción) con roles | Hoy 1 usuario = 1 tienda | M |
| 4.6 | **Cobro con Stripe**: planes, límites por plan, alta/baja automática de flags | Sin esto no hay negocio, solo pilotos | L |
| 4.7 | **RGPD**: aviso de privacidad, consentimiento de marketing, exportar/borrar datos de un cliente, retención de mensajes | Obligatorio antes de cobrar. Ya identificado en VISION §7.3 | M |
| 4.8 | **Backups y monitorización** (Supabase Pro, alertas de `/health`) | Un fallo de datos con clientes reales es mortal | M |

## Bloque 5 — Ya diseñado, pendiente de disparador externo

- **B4**: recordatorios con nombre del servicio → esperando `canalagenda_reminder_v2` aprobada.
- **P2 reactivación + motor proactivo** (doc 09 §4) → esperando plantilla de marketing.
- **P4/P5/P6** premium (doc 09).
- **Módulo de llamadas perdidas** → esperando número español de Twilio.
- **Vigilar** WhatsApp Calling API y los precios de plantillas (VISION §7.5).

---

## Orden recomendado (y por qué)

1. **1.1 + 1.2 (horarios y vacaciones editables)** — es lo que hoy te
   convierte en el cuello de botella de cada tienda. Riesgo bajo, valor alto.
2. **1.3 + 1.4 (citas manuales y avisar al cliente)** — sin esto el bot
   compite con la libreta de papel en vez de sustituirla.
3. **2.1 → 2.8 (equipo completo)** — el bloque grande. Hacerlo por partes y
   verificando que una tienda de una sola persona sigue comportándose igual.
4. **3.A (textos personalizables)** — cuando haya 3-4 tiendas y se note que
   todas suenan igual.
5. **4.1 + 4.3 (vigilancia y métricas)** — antes de terminar los pilotos.
6. **4.6 + 4.7 (Stripe y RGPD)** — antes de cobrar el primer euro.

**Criterio transversal:** cada punto debe poder activarse por tienda y, si no
se usa, dejar el sistema exactamente como estaba. Esa disciplina es la que ha
permitido llegar hasta aquí sin romper nada.
