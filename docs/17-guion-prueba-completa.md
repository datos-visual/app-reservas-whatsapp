# Guion de prueba completa

Última revisión: 10 de agosto de 2026.

Lo que las pruebas automáticas **no** pueden comprobar: que Meta entregue, que
Google escriba, que la base de datos tenga las columnas que el código espera y
que el panel se vea bien. Esto se pasa a mano.

**Cuándo:** después de cada despliegue con cambios de fondo, y **siempre**
antes de enseñárselo a una peluquería.

**Tiempo:** unos 30 minutos. Necesitas tu móvil y el panel abierto.

---

## 0. Antes de empezar (2 min)

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 0.1 | Abres `/admin` | El bloque de **Salud** sale en verde o solo con avisos conocidos |
| 0.2 | Miras la línea **Base de datos** | «Todas las migraciones aplicadas». Si no, **para aquí y ejecútalas** |
| 0.3 | Miras la línea **Planificador** | «Al día», con menos de 15 minutos |
| 0.4 | Miras **Errores del sistema** | Nada sin revisar |

> Si algo de esto falla, no sigas: el resto de la prueba dará resultados
> engañosos.

---

## 1. El panel carga (5 min)

Abre las seis pestañas, una a una. En cada una, **que no salga error y que
los datos sean los tuyos**.

| # | Pestaña | Qué mirar |
|---|---|---|
| 1.1 | Inicio | Carga sin error |
| 1.2 | Agenda | Salen las citas del día, y la vista de rejilla también |
| 1.3 | Equipo | Están tus personas, sus turnos y sus vacaciones |
| 1.4 | Catálogo | Están tus servicios con su duración y precio |
| 1.5 | Horarios | El horario semanal y los cierres |
| 1.6 | Mi plan | Lo contratado arriba, lo demás abajo |

**Fíjate en el tiempo de carga.** La primera puede tardar (el servidor se
duerme); la segunda debe ser inmediata. Si la segunda también tarda, algo va
mal.

---

## 2. Reservar por WhatsApp (10 min)

El camino completo, desde tu móvil.

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 2.1 | Escribes «hola» | Saludo con tu nombre y tres botones |
| 2.2 | Pulsas **Reservar cita** | Lista de servicios con duración y precio |
| 2.3 | Eliges uno | Si tienes *Elegir profesional*: lista de personas. Si no: días |
| 2.4 | Eliges día | Salen huecos reales de ese día |
| 2.5 | Eliges hora | Resumen: servicio, precio, profesional y fecha |
| 2.6 | Pulsas **Confirmar** | Confirmación con tu nombre |
| 2.7 | Miras el panel → Agenda | **La cita está ahí** |
| 2.8 | Miras Google Calendar | **El evento está ahí** |

### Lo que hay que probar además, y suele olvidarse

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 2.9 | Escribes «¿tenéis hueco el viernes por la tarde?» | Entiende día y franja, y ofrece huecos |
| 2.10 | Mandas una **nota de voz** | Responde que no puede escucharla, con el menú |
| 2.11 | Mandas una **foto** | Responde que solo entiende texto, con el menú |
| 2.12 | Escribes una tontería («asdfgh») | Ofrece el menú, no se queda callado |

---

## 3. Cambiar y anular (5 min)

Aquí es donde más ha fallado el sistema históricamente.

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 3.1 | «mis citas» | Salen las tuyas, con botones |
| 3.2 | Pulsas **Cambiar hora** y das otra | Pregunta si confirmas el cambio |
| 3.3 | Confirmas | Cambia la cita **y anula la anterior** — míralo en Calendar |
| 3.4 | Escribes «anúlala» | Pregunta si anula, con botones — **no dice «no encuentro esa cita»** |
| 3.5 | Dices que sí | Se anula en el panel y en Calendar |
| 3.6 | Escribes «déjalo» tras una propuesta | **NO anula nada**: solo rechaza el hueco |

---

## 4. La agenda desde el otro lado (5 min)

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 4.1 | Apuntas una cita a mano desde el panel | Aparece en la agenda y en Calendar |
| 4.2 | Bloqueas una franja | Sale rayada en la rejilla y deja de ofrecerse |
| 4.3 | **Borras una cita en Google Calendar** | En ≤10 min se libera el hueco **y se avisa a la clienta** |
| 4.4 | Pulsas el botón de sincronizar | Detecta el borrado al momento |
| 4.5 | Pones vacaciones a quien tenga una cita pedida | La clienta recibe las opciones por WhatsApp |

---

## 5. Configuración que cambia lo que se ofrece (5 min)

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 5.1 | Cierras un día en Horarios | Ese día deja de ofrecer huecos |
| 5.2 | Cambias la rejilla a 30 min | Un servicio largo ofrece más horas de inicio |
| 5.3 | Pones un aparato con 1 unidad y lo marcas en un servicio | No deja reservar dos a la vez |
| 5.4 | Das de baja a alguien del equipo | Avisa de cuántas citas futuras afecta |
| 5.5 | Con B5.5: marcas a alguien con un solo servicio | Deja de salir para los demás |
| 5.6 | Con B5.5: dejas un servicio sin nadie | **Aviso rojo permanente** en Equipo |

---

## 6. Backoffice (3 min)

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 6.1 | Activas un premium a una tienda | Aparece en su *Mi plan* |
| 6.2 | Lo desactivas | Desaparece de su plan y deja de funcionar |
| 6.3 | Apagas la IA de una tienda | El asistente sigue funcionando **solo con botones** |
| 6.4 | Miras el consumo de IA | El contador ha subido con las pruebas de arriba |

---

## 7. Aislamiento entre tiendas (5 min) — **el que no se salta nunca**

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 7.1 | Abres una ventana de **incógnito** | (En la normal sigue tu sesión de admin y no probarías nada) |
| 7.2 | Entras con el usuario de OTRA tienda | Panel completo y **vacío** |
| 7.3 | Recorres sus seis pestañas | **Ni una clienta, ni una cita, ni un servicio ajeno** |

> Hecho el 10-ago-2026 con `piloto2@test.com`: correcto.

---

## Lo que sigue sin poder probarse

- **Dos números de WhatsApp a la vez.** El rutado está leído, no ejercitado.
  Necesita una segunda línea. **Hacerlo antes de la primera peluquería.**
- **El módulo de llamada perdida con telefonía real.** Se puede probar el
  software con `scripts/simular-llamada-perdida.js`, pero no el desvío del
  fijo de la peluquería.
- **Carga con varias tiendas activas a la vez.**

---

## Si algo falla

1. Mira el bloque de **Salud** de `/admin`: si reventó por dentro, está ahí.
2. Si no, `docs/runbook-incidencias.md`.
3. Cuando lo arregles, **añade una prueba automática** si el fallo era de
   lógica, o **una línea a este guion** si era de integración. La lista crece
   con lo que de verdad pasa, no con lo que imaginamos.
