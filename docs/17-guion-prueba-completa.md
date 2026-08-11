# Guion de prueba completa

Última revisión: 11 de agosto de 2026.

Lo que las pruebas automáticas **no** pueden comprobar: que Meta entregue, que
Google escriba, que la base de datos tenga las columnas que el código espera y
que el panel se vea bien. Esto se pasa a mano.

**Cuándo:** después de cada despliegue con cambios de fondo, y **siempre**
antes de enseñárselo a una peluquería.

**Tiempo:** unos 45 minutos. Necesitas tu móvil y el panel abierto.

**Cómo anotar:** apunta lo que falle con el número del punto. Si algo falla, no
lo arregles sobre la marcha — termina el guion y luego se ven todos juntos.

> Los puntos marcados con **[NUEVO]** son cambios recientes que nunca se han
> probado en producción. Si tienes poco tiempo, haz solo esos.

---

## 0. Antes de empezar — 3 min

Si algo de aquí falla, **para**: el resto daría resultados engañosos.

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 0.1 | Render → backend → Events | Último despliegue *Live* y con el commit de hoy |
| 0.2 | Render → frontend → Events | Igual. **Los dos servicios**, no solo uno |
| 0.3 | Abres el panel en **ventana de incógnito** | Obligatorio: la caché del navegador nos ha engañado ya dos veces |
| 0.4 | `/admin` → bloque **Salud** | Verde, o solo con avisos que reconozcas |
| 0.5 | Línea **Base de datos** | «Todas las migraciones aplicadas». Si no, ejecútalas y vuelve a empezar |
| 0.6 | Línea **Planificador** | «Al día», menos de 15 minutos |
| 0.7 | Línea **Errores del sistema** | Nada sin revisar |

**Migraciones que deben estar puestas** (el propio bloque te dirá cuál falta):
`migration_cron_runs.sql`, `migration_tope_ia.sql`,
`migration_ia_interruptor.sql`, `migration_errores_sistema.sql`,
`migration_servicios_por_profesional.sql`, `migration_elegir_profesional.sql`.

---

## 1. Aspecto **[NUEVO]** — 5 min

El diseño cambió entero ayer. Mira esto **en el móvil**, no solo en el
portátil: el fallo anterior solo se veía con luz.

| # | Qué miras | Qué tiene que pasar |
|---|---|---|
| 1.1 | Fondo y tarjetas | Lienzo gris claro, tarjetas **blancas** con filete fino. Si son grises sobre gris, estás viendo la versión vieja |
| 1.2 | Botón principal de cada pantalla | **Bloque negro** con texto blanco. Solo uno por pantalla |
| 1.3 | Pasas el ratón por un botón secundario | Se **invierte** a negro |
| 1.4 | Color en la pantalla | Solo en estados: verde correcto, ámbar aviso, rojo error. **En ningún sitio más** |
| 1.5 | Con el móvil, cerca de una ventana | Todo se sigue leyendo y los botones se distinguen |
| 1.6 | Cabecera al bajar | Se queda fija arriba |

---

## 2. El panel carga — 5 min

Abre las seis pestañas, una a una.

| # | Pestaña | Qué mirar |
|---|---|---|
| 2.1 | Inicio | Carga sin error |
| 2.2 | Agenda | Citas del día, y también la vista de **rejilla** |
| 2.3 | Equipo | Personas, turnos y vacaciones |
| 2.4 | Catálogo | Servicios con duración y precio |
| 2.5 | Horarios | Horario semanal y cierres |
| 2.6 | Mi plan | Contratado arriba, resto abajo |

**Y cronometra la segunda carga.** La primera puede tardar (el servidor se
duerme); **la segunda debe ser inmediata**. Si también tarda, dímelo: ayer
quitamos seis consultas repetidas y quiero saber si sirvió.

---

## 3. Reservar por WhatsApp — 10 min

### 3.1 El camino normal

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 3.1.1 | «hola» | Saludo con tu nombre y tres botones |
| 3.1.2 | **Reservar cita** | Lista de servicios con duración y precio |
| 3.1.3 | Eliges uno | Lista de profesionales (si tienes B5.3) o días |
| 3.1.4 | Eliges día | Huecos reales de ese día |
| 3.1.5 | Eliges hora | Resumen: servicio, precio, profesional y fecha |
| 3.1.6 | **Confirmar** | Confirmación con tu nombre |
| 3.1.7 | Panel → Agenda | **La cita está ahí** |
| 3.1.8 | Google Calendar | **El evento está ahí** |

### 3.2 El servicio, que era el agujero **[NUEVO]**

| # | Qué escribes | Qué tiene que pasar |
|---|---|---|
| 3.2.1 | «Quiero una **permanente** para mañana a las 12h» | **«No tenemos "permanente" en el catálogo»** + lista. **NO debe reservar nada** |
| 3.2.2 | «Quiero cita mañana a las 12» (sin servicio) | Te pregunta qué servicio, con la lista |
| 3.2.3 | …y eliges uno de esa lista | **Retoma tu hora**: no te vuelve a preguntar el día |
| 3.2.4 | «Quiero un **tinte** mañana a las 10» | Reconoce el tinte y confirma **diciendo el nombre del servicio** |
| 3.2.5 | Miras esa cita en el panel | Tiene el servicio puesto y **la duración real** (no 30 min por defecto) |

> Si 3.2.1 reserva algo, es el fallo más grave de la lista: la clienta se
> presenta esperando una permanente que no hacéis.

### 3.3 Lenguaje natural

| # | Qué escribes | Qué tiene que pasar |
|---|---|---|
| 3.3.1 | «¿tenéis hueco el viernes por la tarde?» | Entiende día y franja |
| 3.3.2 | «asdfgh» | Ofrece el menú; **no se queda callado** |

### 3.4 Notas de voz y fotos **[NUEVO]**

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 3.4.1 | Mandas una **nota de voz** | «Todavía no puedo escuchar audios…» + menú |
| 3.4.2 | Mandas una **foto** | «De momento solo entiendo texto…» + menú |
| 3.4.3 | Panel → Inicio → conversaciones | Ese intercambio **aparece registrado** |

> Antes de ayer, esto no producía **ninguna** respuesta ni dejaba rastro.

---

## 4. Cambiar y anular — 7 min

Donde más ha fallado históricamente.

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 4.1 | «mis citas» | Salen las tuyas, con botones |
| 4.2 | **Cambiar hora** y das otra | Pregunta si confirmas |
| 4.3 | Confirmas | Cambia **y anula la anterior** — compruébalo en Calendar |
| 4.4 | «anúlala» | Pregunta si anula, con botones. **Nunca «no encuentro esa cita»** |
| 4.5 | Dices que sí | Se anula en el panel y en Calendar |
| 4.6 | Tras una propuesta, escribes «**déjalo**» | **NO anula nada**: solo rechaza el hueco |
| 4.7 | Pulsas **Confirmo** en un recordatorio | Confirma. En el panel desaparece el «sin confirmar» |

---

## 5. La agenda desde el panel — 8 min

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 5.1 | Apuntas una cita a mano | Aparece en la agenda y en Calendar |
| 5.2 | Bloqueas una franja | Sale rayada en la rejilla y deja de ofrecerse |
| 5.3 | **Borras una cita en Google Calendar** | En ≤10 min se libera el hueco **y se avisa a la clienta** |
| 5.4 | Pulsas el botón **Google Calendar** | Lo detecta al momento **[NUEVO: antes ignoraba las citas de menos de 15 min; ahora, de menos de 2]** |
| 5.5 | Vacaciones a quien tenga una cita pedida | La clienta recibe las opciones por WhatsApp |

### La rejilla **[NUEVO]**

| # | Qué miras | Qué tiene que pasar |
|---|---|---|
| 5.6 | Círculos de cada columna | **Dos iniciales** en monoespaciada, con borde negro |
| 5.7 | Una cita ya pasada | **Apagada en gris** |
| 5.8 | Una cita sin confirmar por la clienta | **Borde discontinuo** y nombre en cursiva |
| 5.9 | Leyenda de abajo | Explica el rayado, el hueco libre, el discontinuo y las pasadas |
| 5.10 | Vista de lista | Etiqueta **sin confirmar** y filas pasadas apagadas |

---

## 6. Configuración que cambia lo que se ofrece — 6 min

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 6.1 | Cierras un día en Horarios | Ese día deja de ofrecer huecos |
| 6.2 | Rejilla a 30 min | Un servicio largo ofrece más horas de inicio |
| 6.3 | Aparato con 1 unidad, marcado en un servicio | No deja reservar dos a la vez |
| 6.4 | Das de baja a alguien | Avisa de cuántas citas futuras afecta |
| 6.5 | Turno solo el martes a alguien | **Libra el resto de la semana** (bug del 10-ago) |
| 6.6 | B5.5: marcas a alguien con un solo servicio | Deja de salir para los demás |
| 6.7 | B5.5: dejas un servicio sin nadie | **Aviso rojo permanente** en Equipo |
| 6.8 | Cambias cualquier ajuste y recargas | **Se ve al momento** (hay caché de 15 s; si tarda, es un fallo) **[NUEVO]** |

---

## 7. Backoffice — 5 min

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 7.1 | Activas un premium a una tienda | Aparece en su *Mi plan* **al instante** |
| 7.2 | Lo desactivas | Desaparece y deja de funcionar |
| 7.3 | Etiqueta **IA hoy: n / 400** en cada tienda | Sale, y el número sube con las pruebas de arriba **[NUEVO]** |
| 7.4 | Desmarcas **Interpretar texto libre con IA** | El asistente sigue funcionando **solo con botones** **[NUEVO]** |
| 7.5 | Lo vuelves a marcar | Vuelve a entender lenguaje natural |
| 7.6 | Inicio → conversaciones | Si escribiste y no hubo respuesta, sale **«n sin responder»** con punto ámbar **[NUEVO]** |

---

## 8. Aislamiento entre tiendas — 5 min

**El que no se salta nunca.**

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 8.1 | Ventana de **incógnito** | (En la normal sigue tu sesión de admin) |
| 8.2 | Entras con el usuario de OTRA tienda | Panel completo y **vacío** |
| 8.3 | Recorres sus seis pestañas | **Ni una clienta, ni una cita, ni un servicio ajeno** |

---

## 9. Que los errores se vean **[NUEVO]** — 2 min

| # | Qué haces | Qué tiene que pasar |
|---|---|---|
| 9.1 | Tras todas las pruebas, `/admin` → Salud | Si algo reventó por dentro, sale en **Errores del sistema** |
| 9.2 | Abres esa línea | Dice de qué tienda y cuántas veces |
| 9.3 | Pulsas **Visto** | Desaparece |

Si has visto algún comportamiento raro y aquí **no** sale nada, es un fallo que
no estábamos vigilando. Dímelo: hay que añadir la comprobación.

---

## Lo que sigue sin poder probarse

- **Dos números de WhatsApp a la vez.** El rutado está leído, no ejercitado.
  Necesita una segunda línea. **Antes de la primera peluquería.**
- **El módulo de llamada perdida con telefonía real.** El software se prueba
  con `scripts/simular-llamada-perdida.js`; el desvío del fijo, no.
- **Carga con varias tiendas activas a la vez.**

## Fallos conocidos, aún sin arreglar

Estos ya los sabemos — si aparecen, no hace falta que los apuntes:

1. Preguntar «¿cuánto dura?» o «¿cuánto cuesta?» **no se responde**.
2. «Apúntame con Marta» **por texto** no funciona (sí por botón).
3. El asistente puede **repetir el mismo mensaje dos veces seguidas**.

## Si algo falla

1. Mira **Salud** en `/admin`.
2. Si no, `docs/runbook-incidencias.md`.
3. Cuando se arregle: **prueba automática** si era de lógica, **línea nueva en
   este guion** si era de integración. La lista crece con lo que de verdad
   pasa, no con lo que imaginamos.
