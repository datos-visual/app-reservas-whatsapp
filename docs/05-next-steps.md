# Próximos trabajos

Última revisión: 10 de agosto de 2026.

Este documento estaba congelado en julio y describía un producto que ya no
existe. Reescrito con el estado real. **Ordenado por lo que bloquea, no por
lo que apetece.**

---

## 1. Bloqueantes con plazos que no se pueden comprimir

Empiézalos ya aunque no haya cliente: son semanas de espera de terceros.

- **Constituir la sociedad.**
- **Verificación de negocio en Meta.** Sin ella no se sale del modo de
  pruebas.
- **Revisión legal** del aviso de privacidad y el contrato de encargado del
  tratamiento (`docs/legal/`). Los campos entre corchetes siguen sin rellenar.

## 2. Antes de enseñárselo a una peluquería real

- **Prueba multitienda.** Dos partes:
  - *Panel*: ✅ **HECHA el 10-ago-2026.** Segundo usuario (`piloto2@test.com`)
    en ventana de incógnito: panel completo y **vacío**, sin ver nada de la
    primera tienda. El aislamiento por `store_users` funciona.
  - *Webhook* (necesita un segundo `phone_number_id`, o sea una segunda línea
    telefónica). El rutado está escrito y leído, pero **nunca han entrado
    mensajes de dos números a la vez**. No descubrirlo con la clienta delante.
- **Prueba de una semana con dos móviles y dos personas**, una de ellas que no
  sepa cómo funciona.
- **Clave de pago para el NLU** (ver punto 3).
- **Comprobar el arranque en frío.** El cron cada 10 min debería impedir que
  Render duerma el servicio. Si aun así hay esperas largas, lo que falla es el
  cron, no el plan de pago.

## 3. Recursos compartidos entre tiendas

Ninguno rompe el aislamiento de datos; todos crean **fallos correlacionados**:
si uno cae, caen todas las peluquerías a la vez.

| Recurso | Estado | Qué hacer |
|---|---|---|
| App de Meta | Correcto por diseño | Nada. Embedded Signup pone la cuenta a nombre del cliente → hacerlo hacia la 4ª o 5ª tienda |
| Claves de IA | Cuota compartida | **Pasar a clave de pago.** Freno por tienda: hecho (tope diario + interruptor manual en `/admin`) |
| Servidor Render | Uno solo | Plan de pago cuando haya clientes de verdad |
| Cuenta de servicio de Google | Una para todos | Ver abajo |

### Google: OAuth por tienda (pendiente, no urgente)

Hoy hay **una sola cuenta de servicio** y cada salón comparte su calendario
con ese correo. Funciona y la cuota no aprieta ni de lejos (un salón hace
cientos de llamadas al día; el límite está en el millón).

Los motivos reales para cambiarlo, por orden de importancia:

1. **Radio de daño.** Esa clave privada abre TODOS los calendarios a la vez.
   Mientras siga así: solo en variables de entorno de Render, nunca en el
   repositorio, y rotada ante cualquier sospecha.
2. **Fricción de alta.** Pedirle a la dueña que comparta su calendario con un
   correo de robot es el paso donde más se atasca el onboarding.
3. **Control del cliente.** Con OAuth, revocar el acceso lo hace ella desde su
   cuenta de Google sin llamarnos. Es también el argumento más limpio de cara
   al RGPD.

**Qué implica:** flujo OAuth de Google, guardar un `refresh_token` por tienda
en `calendar_connections`, refresco de tokens, y **verificación de la
aplicación por parte de Google** para pedir permisos de calendario a usuarios
externos — un proceso de semanas, del mismo tipo que la verificación de Meta.

**Cuándo:** no antes del piloto. Sí antes de crecer de verdad. Si se hace,
conviene hacerlo a la vez que Embedded Signup: son el mismo tipo de trabajo
(mover una conexión de «yo la configuro a mano» a «el cliente la autoriza»).

## 3.bis Módulo de llamada perdida: lo que cuesta de verdad

Revisado el 10-ago-2026 tras comprobarlo en la consola de Twilio.

**Un número por peluquería, sin alternativa.** El módulo identifica la tienda
por el número al que se desvía la llamada. Dos salones no pueden compartirlo.

**Cada número español exige un paquete regulatorio** con NIF, dirección y
justificante **del usuario final**, que es la peluquería, no nosotros.

**Pero eso SÍ se automatiza.** Twilio tiene API de cumplimiento
(`EndUsers`, `SupportingDocuments`, `ItemAssignments`, `Bundles`), se puede
enviar a revisión desde código, hay `Status callback URL` para enterarse del
resultado y una API de evaluaciones para validar el paquete ANTES de enviarlo.

Diseño correcto del alta, sin intervención humana:

1. La tienda rellena NIF y dirección y sube su justificante desde el panel.
2. El backend crea el usuario final, sube el documento, monta el paquete, lo
   evalúa (si falta algo se lo dice en el momento) y lo envía a revisión.
3. Al llegar el callback de aprobación, compra el número y le configura el
   webhook. Si es rechazo, el panel enseña el motivo y pide otro documento.

**Lo que queda fuera de nuestro control:**

- **La revisión de Twilio tarda días.** Es latencia, no trabajo nuestro: para
  la tienda es una verificación como cualquier otra.
- **El inventario.** Hoy NO hay números españoles disponibles (comprobado
  10-ago-2026, búsqueda sin filtros: cero resultados). Eso no lo resuelve
  ninguna API — es una solicitud a soporte, y es el bloqueo real.
- Los rechazos cuyo motivo no se entienda.

**Consecuencia para el precio:** es el primer componente con **coste variable
por cliente** (cuota mensual del número + minutos). El resto de la
infraestructura es coste fijo repartido. Tiene que ser un extra con su propia
cuota, no ir incluido en el precio base.

**Y no bloquear el piloto con esto.** El producto es reservar por WhatsApp;
esto es un extra. Para validar el software sin esperar: comprar un número de
cualquier país con *Address requirements: None* (se compra en el acto, sin
papeleo) y probar el circuito entero. Lo único que necesita ser español es el
destino final del desvío.

## 4. Lo que hará que renueve al segundo mes

Nada de esto existe todavía y no es técnico:

- Una pantalla de **cómo va el negocio**: citas de la semana, no-shows,
  huecos vendidos.
- Qué pasa cuando el asistente **no entiende algo** — ¿hay un modo «avísame»?
- Cobros / señales (Stripe).

## 5. Deliberadamente aparcado

Un calendario de Google por profesional (arreglaría del todo los eventos
escritos a mano), las cinco funciones premium sin construir, Redis, y
cualquier automatización nueva. Todo esto se decide mejor **con una
peluquería real diciendo qué le falta**.
