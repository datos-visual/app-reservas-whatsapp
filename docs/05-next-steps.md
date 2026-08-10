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
  - *Panel* (gratis, hoy): segunda tienda + segundo usuario, y comprobar que
    no ve NADA de la primera. Es la mitad crítica, la de seguridad.
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
| Claves de IA | Cuota compartida | **Pasar a clave de pago.** Tope por tienda: hecho (`migration_tope_ia.sql`) |
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
