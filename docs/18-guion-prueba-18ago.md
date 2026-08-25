# Guion de prueba — 18-ago-2026

Comprueba **todo lo tocado entre el 14 y el 18 de agosto**. Una hora larga.

Cada paso tiene lo que haces y **lo que tiene que pasar**. Si no pasa, apunta
el número y sigue: no pares la tanda.

> **⚠️ Los pasos marcados con ⚠️ son arreglos recientes.** Si falla uno de
> esos, es una regresión y avisa antes de seguir.

---

## BLOQUE 0 · Que estés probando lo que crees (5 min)

Esto va primero por una razón: el 11 de agosto se perdieron **cuatro días**
arreglando fallos que ya estaban arreglados, porque el backend no se
desplegaba y Render seguía diciendo «Live».

**0.1** Abre `https://app-whatsapp-backend.onrender.com/health`

→ Anota el `commit`. Compáralo con `git log --oneline -1`. **Si no coinciden,
para aquí y despliega.** La primera petición puede tardar ~50 s (plan gratuito).

**0.2** En Render, comprueba que **los dos** servicios están desplegados con ese
commit: `app-whatsapp-backend` **y** `app-whatsapp-frontend`.

**0.3** Abre `/admin` → bloque **Salud**.

→ Apunta lo que salga en rojo o ámbar. Si falta alguna migración, aplícala antes
de seguir (`migration_bloqueos.sql` es la última).

---

## BLOQUE 1 · Limpiar el terreno (10 min)

Los datos de las pruebas anteriores invalidan las nuevas.

**1.1** Panel → **Equipo** → Claudia → *Turnos y vacaciones*.

→ Tiene **dos ausencias idénticas** del 8 al 31 de agosto. Quita una.
→ Y quita también la otra si quieres que Claudia esté disponible en las pruebas.

**1.2** Panel → **Agenda** → lunes 31 de agosto.

→ Cancela las citas de prueba que haya a las 10:00 y a las 11:00.

**1.3** Comprueba que Marta, Laura, Borja y Claudia ponen **«Todo el horario del
negocio»** y ninguna tiene vacaciones activas.

**1.4** Panel → **Catálogo**: deben existir `Corte` (30), `Corte + lavado` (45),
`Tinte` (120), `Mechas` (150), `Peinado evento` (45), `Barba` (15),
`Tratamiento keratina` (90).

**1.5** **Equipo → Aparatos**: `Sillón de color` (1 unidad) y `Lavacabezas`
(2 unidades). El servicio `Tinte` requiere el sillón; `Corte + lavado` requiere
el lavacabezas.

---

## BLOQUE 2 · La web comercial (5 min)

**2.1** Abre la raíz del frontend: `https://app-whatsapp-frontend.onrender.com/`

→ ⚠️ Debe salir la **web comercial**, no el panel. Titular de peluquerías.
→ Debajo, una banda: **Peluquerías** en verde y «Talleres mecánicos · pronto»
   en gris.

**2.2** Pulsa **Peluquerías**.

→ ⚠️ Página `/peluquerias` con los bloques: los tres dolores, la conversación
   de ejemplo, «lo que una agenda cualquiera no resuelve» (cinco cosas) y las
   preguntas frecuentes.

**2.3** Comprueba que abren `/precios`, `/como-funciona`, `/contacto`,
`/privacidad` y `/terminos`.

→ ⚠️ Antes ninguna existía: daban 404.

**2.4** Pulsa **Entrar** en la barra de arriba → entra con tu cuenta.

→ ⚠️ Debes aterrizar en **`/panel`**, no en `/`.

**2.5** Pincha las seis pestañas del menú lateral y `/admin`.

→ Todas cargan. Ninguna da 404.

---

## BLOQUE 3 · La agenda (10 min)

**3.1** Panel → **Agenda**. Cronometra.

→ ⚠️ Debe pintarse en **1–2 segundos**. Si tarda más de cinco, mira los logs de
   Render y busca `[Agenda] Carga lenta`: dirá los milisegundos exactos.

**3.2** Cambia de día tres veces seguidas, rápido.

→ ⚠️ Debe quedarse en el **último** día que has pulsado. Antes, si la primera
   respuesta llegaba la última, pintaba el día equivocado.

**3.3** Vista **Rejilla**. Toca una cita.

→ ⚠️ El detalle sale **encima** de la rejilla (antes salía debajo, fuera de la
   pantalla) y la cita queda **resaltada**.
→ Con ninguna seleccionada, se lee: *«Toca una cita de la rejilla para
   cambiarla de profesional o cancelarla»*.

**3.4** Desde ese detalle, cambia la cita de profesional. Luego cancélala.

→ Las dos acciones funcionan sin salir de la rejilla.

---

## BLOQUE 4 · Bloquear horas (10 min)

**4.1** Panel → **Horarios** → *Bloquear horas sueltas*.

→ ⚠️ El formulario debe verse ordenado: Día · Desde · Hasta · ¿A quién afecta?
   · Motivo, con anchos parejos y el botón a la derecha.

**4.2** Bloquea el **martes 1 de septiembre de 12:00 a 14:00**, **solo Marta**,
motivo «Médico».

→ Aparece en la lista: `mar, 01/09 · 12:00–14:00 · solo Marta · Médico`.

**4.3** Ve a **Agenda** → martes 1 de septiembre → Rejilla.

→ ⚠️ La columna de **Marta** sale rayada de 12:00 a 14:00. **Las demás no.**

**4.4** Bloquea el **miércoles 2 de 09:00 a 10:00** para **toda la tienda**.

→ En la rejilla del día 2, **todas** las columnas rayadas en esa franja.

**4.5** Intenta bloquear un rato donde ya haya una cita.

→ Lo guarda **pero avisa en rojo**: «ya hay N citas reservadas dentro de ese
   rato. No se ha tocado ninguna». Las citas siguen ahí.

---

## BLOQUE 5 · Apuntar citas desde el panel (10 min)

**5.1** Panel → Agenda → **martes 1 de septiembre** → *Apuntar una cita*.

→ ⚠️ Debe haber un desplegable **«Quien esté libre / Con Marta / Con Laura…»**.

**5.2** Apunta: tu teléfono, `Corte`, **con Marta**, a las **12:30**.

→ ⚠️ **Debe negarse**: *«Marta no tiene libre las 12:30 (turno, vacaciones, un
   bloqueo o ya tiene cita)»*. **No puede repartirla a otra persona en
   silencio.**

**5.3** La misma cita, pero **con Laura**.

→ Se crea. En la rejilla aparece en la columna de Laura.

**5.4** Apunta **otra** cita al mismo teléfono, misma hora, con **Borja**.

→ ⚠️ Sale un aviso: *«Esa clienta ya tiene una cita a las 12:30. ¿Seguro…?»*
→ Dile **Cancelar**: no se crea.
→ Repítelo y dile **Aceptar**: se crea. (En el panel se pregunta; por WhatsApp
   se bloquea sin preguntar.)

**5.5** Borra esa última.

---

## BLOQUE 6 · WhatsApp: lo que se arregló esta semana (20 min)

Desde tu móvil, al número del bot. **Una captura por paso.**

**6.1** Escribe: `Corte y lavado el miércoles 2 a las 11:00`

→ ⚠️ **Debe decir «Corte + lavado» (45 min), NO «Corte».** Este es el fallo más
   grave de la ronda anterior: reservaba 30 minutos y sin lavacabezas.

**6.2** Escribe: `Un peinado de evento el jueves 3 a las 10:00`

→ ⚠️ Debe reconocer **«Peinado evento»** (45 min).

**6.3** Escribe: `Quiero una permanente para el jueves 3 a las 12:00`

→ ⚠️ *«No tenemos «permanente» en el catálogo. Esto es lo que hacemos:»* + lista.
→ **No puede reservar nada.**

**6.4** Encadenado, sin salir de la conversación: primero `Quiero un corte de
pelo para el jueves 3`, y después `Pues una permanente a las 12h`.

→ ⚠️ Tiene que seguir diciendo que no hacéis permanentes. **No puede tirar del
   corte que mencionaste antes.**

**6.5** Escribe: `¿Hacéis permanente?`

→ ⚠️ Enseña el catálogo. No «no te he entendido».

**6.6** Escribe: `Quiero una cita con Laura el viernes 4 a las 10:00`

→ ⚠️ **No debe preguntarte con quién** — ya lo has dicho. Si Laura puede, va
   directo a confirmar «con Laura».

**6.7** Escribe algo con alguien **que no pueda** (usa el bloqueo de Marta):
`Corte con Marta el martes 1 a las 12:30`

→ ⚠️ *«Marta no tiene libre el martes 01/09 a las 12:30. Dime otra hora y miro
   cuándo puede, o te lo reservo con quien esté libre.»*
→ **No puede decir «acaba de quedarse sin ese hueco»**: Marta llevaba horas
   bloqueada.

**6.8** Responde exactamente: `Reserva con quien esté libre`

→ ⚠️ **Debe reservar** con otra persona a esa misma hora. Antes repetía el
   mismo mensaje una y otra vez.

**6.9** Escribe: `asdfgh qwerty`

→ ⚠️ Menú de bienvenida con «Perdona, no te he entendido bien».
→ **NO puede contestar «Tienes N citas próximas».**

**6.10** Escribe: `MIS CITAS` → luego `CANCELAR` → elige una → confirma.

→ Cancela y lo dice. Vuelve a pedir `MIS CITAS`: ya no está.

**6.11** Pide otra vez el hueco que acabas de liberar.

→ Vuelve a ofrecerse.

**6.12** Escribe: `Corte el domingo 6`

→ *«La tienda está cerrada ese día.»*

---

## BLOQUE 7 · Recordatorios y calendario (10 min)

**7.1** Crea una cita para **dentro de unas 2 horas** desde el panel.

→ En la siguiente pasada del cron debe llegar el recordatorio de 2 h.

**7.2** Cuando llegue, pulsa **Confirmo**.

→ *«¡Gracias por confirmar!»*. En la rejilla, esa cita deja de tener el borde
   discontinuo.

**7.3** ⚠️ Espera a que la hora de esa cita **haya pasado** y vuelve a pulsar
**Confirmo** en el mismo mensaje (el botón sigue ahí).

→ ⚠️ **NO puede decir «gracias por confirmar»** de una cita que ya pasó. Debe
   decir que esa cita ya no está activa.

**7.4** Borra en **Google Calendar** el evento de una cita futura.

→ El hueco **no** se libera al instante: lo hace el planificador (10 min) o al
   pulsar **«Google Calendar»** en el panel. Es a propósito — pruébalo con el
   botón.

---

## BLOQUE 8 · Lo que no se ve (5 min)

**8.1** Logs de Render (backend) → busca `[Equipo] Huecos filtrados`.

→ ⚠️ Debe salir `descartados: { bloqueo, nadie_libre, calendario_ajeno,
   otra_persona, sin_aparato }`. **Es la herramienta de diagnóstico**: cuando un
   hueco no salga, esto dice por qué sin adivinar.

**8.2** Busca `[Calendar] Cliente Google`.

→ ⚠️ Debe salir **una sola vez** desde el arranque, no en cada petición.

**8.3** `/admin` → Salud → **Errores del sistema**.

→ Debe estar vacío. Si hay algo, cópialo.

---

## Cierre

Apunta los números que hayan fallado y mándamelos con la captura. Los ⚠️ son
regresiones (algo que funcionaba y se ha roto) y van primero.

Lo que **ya sabemos que sigue pendiente**, no hace falta que lo reportes:

- «¿cuánto cuesta?» y «¿cuánto dura?» no tienen respuesta.
- Los rechazos dicen «ese horario ya no está disponible» en vez del motivo real
  («los sábados cerramos a las 14:00»).
- La rejilla no marca en gris a quien está de vacaciones.
- Google Calendar caído: no hay prueba de que el sistema no dé el día por libre.
- Multitienda con una segunda línea de WhatsApp: sin probar.
