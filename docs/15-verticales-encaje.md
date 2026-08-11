# Qué verticales encajan en el motor (y cuáles no)

Última revisión: 10 de agosto de 2026.

CanalAgenda nació con peluquerías, pero el objetivo es servir a más sectores.
Este documento dice **qué se puede vender hoy, qué falta y qué no encaja**, para
que nadie prometa algo que el motor no hace.

---

## Lo que el motor sabe hacer, en abstracto

Quitando el vocabulario, el sistema resuelve exactamente este problema:

> Reservar un **hueco de reloj dentro de un día**, consumiendo una **persona**
> y opcionalmente un **aparato**, durante una **duración fija** por servicio.

Todo lo demás —turnos, vacaciones, fases, elegir profesional, habilidades— son
matices sobre esa frase. Si un negocio encaja en ella, encaja en el motor.

**Buena noticia comprobada el 10-ago-2026:** de las 51 apariciones de la
palabra «clienta» en el código, 44 son comentarios y 7 son logs o nombres de
variable. **Ni una está en un mensaje que lea el cliente final.** Los textos
hablan de tú («tu cita», «te escribo por»), así que el motor no está
contaminado de peluquería: solo lo están unas pocas etiquetas.

---

## Peluquería / estética ✅ en producción

El vertical de origen. Semilla en `verticals.js`.

## Taller mecánico ✅ encaja, con un hueco conocido

Traducción directa: mecánicos = personas, elevadores = aparatos, reparaciones
= servicios con duración. Ya tiene semilla.

**Lo que falta:** la semilla usa `mode: 'franja'` para «Pre-ITV» y «Revisión»
(mañana / tarde / día entero) y **eso no está implementado**. Hoy solo existen
huecos de reloj. Un taller quiere decir «déjalo por la mañana», no «a las
10:30». Es trabajo real y hay que hacerlo antes de vender a un taller.

**Vocabulario a cambiar:** «profesional» → «mecánico»; «servicio» → «trabajo».

## Restaurante ⚠️ encaja a medias

Los horarios y los turnos sí. El problema es la **capacidad**: un restaurante
no reserva «una cita por recurso», reserva **plazas** — una mesa de cuatro.

**Lo que falta:** preguntar «¿cuántos sois?» y descontar N plazas de un aforo.
El campo `resources.units` se acerca, pero el flujo de conversación no lo
pregunta y el motor no cuenta comensales.

No es vocabulario: es una dimensión nueva en el cálculo de disponibilidad.

## Casa rural ❌ NO encaja — y no debe forzarse

Éste es el «no» importante del documento.

Una casa rural no reserva franjas dentro de un día: reserva **noches en
rango**, con fecha de entrada y salida, estancia mínima, y precio por noche.
Además la disponibilidad es de la propiedad entera, no de una persona.

Eso es **otro motor de disponibilidad**, no una traducción de palabras.
Meterlo a la fuerza en el actual significaría contaminar el cálculo de huecos
—la parte más delicada y más veces rota del sistema— para servir a un caso que
no se le parece.

**Si se quiere hacer, se hace como un segundo motor** que comparta tienda,
clientes, WhatsApp y panel, pero con su propia lógica de disponibilidad.

---

## Regla para añadir un vertical

1. **Comprobar el encaje con la frase de arriba** antes que nada. Si no
   encaja, no es un vertical: es un producto nuevo.
2. Añadir la semilla en `verticals.js` (servicios, duraciones, precios).
3. Añadir el bloque de frases en `vocabulario.js` (ver abajo).
4. Probar el ciclo completo con un negocio real de ese sector antes de vender
   al segundo.

## El vocabulario: `backend/src/vocabulario.js`

Hecho el 10-ago-2026. **Solo OCHO frases de todo el asistente dependen del
sector.** El resto ya habla de tú («tu cita», «te escribo por») y sirve igual
para una peluquería que para un taller.

Para añadir un sector: copiar el bloque `defecto`, traducir las ocho frases y
darle el código del vertical. Nada más — no se toca el motor.

**Se guardan frases enteras, no palabras sueltas.** La tentación es guardar el
sustantivo y armar la frase con código, pero en español eso obliga a manejar
género y artículo: «LA profesional» pero «EL mecánico», «otra profesional»
pero «otro mecánico». Ensamblar gramática con plantillas es una fábrica de
erratas, y una errata la lee el cliente.

`test/vocabulario.test.js` comprueba que ningún sector se deje una frase sin
traducir y que los títulos caben en los límites de WhatsApp (20 caracteres los
botones, 24 las filas). Meta no avisa cuando se pasa: recorta y deja la frase
a medias en el móvil.

## Lo que hay que hacer antes del segundo vertical

- ~~Sacar las etiquetas dependientes del sector a un módulo~~ ✅ hecho.
- Implementar el modo «franja» (mañana / tarde / día) que el taller necesita.
- Decidir si el restaurante entra, porque implica tocar el cálculo de huecos.
