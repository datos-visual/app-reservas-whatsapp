# Pruebas automáticas

Última revisión: 10 de agosto de 2026.

## Para qué están

No están para "tener cobertura". Están porque **este sistema falla en
silencio hacia el lado peligroso**: cuando algo se rompe, no da error, deja de
ofrecer huecos. La peluquería pierde dinero y lo achaca a que no había hueco.

Cada prueba de este proyecto corresponde a **un fallo real que ya ocurrió**.
Si añades una, que sea porque algo se rompió, y déjalo escrito en el
comentario con su fecha.

## Cómo se ejecutan

```
cd backend  && npm test
cd frontend && npm test
```

Tardan segundos. **No tocan la base de datos, ni Google, ni Meta, ni la IA**:
no hacen falta claves ni conexión. Prueban las *decisiones* pasándoles los
datos en la mano.

Se ejecutan solas en cada push a `main` y en cada pull request
(`.github/workflows/pruebas.yml`). Si salen en rojo, **no despliegues**.

## Qué cubren

| Fichero | Protege |
|---|---|
| `backend/test/disponibilidad.test.js` | Quién puede atender: turnos, vacaciones, solapes, fases y servicios por profesional |
| `backend/test/huecos.test.js` | Qué horas se ofrecen: rejilla de inicio, capacidad, selección premium |
| `backend/test/nlu.test.js` | Que la IA no cuele nada: validación de su salida y contexto del prompt |
| `backend/test/ia-tope.test.js` | El freno de la IA: interruptor manual, tope diario y qué pasa si el freno falla |
| `backend/test/salud.test.js` | Que el semáforo de `/admin` no se ponga en verde con algo roto |
| `backend/test/errores.test.js` | Que el buzón de errores no guarde datos de clientas y que se vea en Salud |
| `backend/test/rutas.test.js` | **La frontera de autenticación**: qué rutas responden sin credenciales |
| `frontend/test/rejilla.test.ts` | Que la pantalla pinte lo mismo que calcula el motor |

## El detector de variables inexistentes

`npm test` ejecuta **antes** que nada `eslint` con una sola regla: `no-undef`.
No es un formateador de estilo, es un detector de bombas.

El 10-ago-2026, nada más instalarlo, encontró dos fallos que llevaban semanas
en producción: `fmtHuman` usada fuera de su función (reventaba el flujo «tu
profesional no puede») y `profileName` sin declarar (reventaba «Lo quiero» de
la lista de espera). **Sintaxis correcta, `node --check` en verde, pruebas en
verde** — y la petición moría al llegar.

Es imprescindible al mover código de sitio: dejarse una referencia atrás es el
error más fácil de cometer y el más difícil de notar.

## La regla que hace esto posible

**La decisión se separa de la fontanería.**

Lo que decide (`equipo.disponibilidadEnRango`, `huecos.generateSlots`,
`nlu.validateNluResult`, `rejilla.franjasFueraDeTurno`) recibe sus datos por
parámetro y devuelve una respuesta. Lo que habla con el mundo (Supabase,
Google, Meta) vive en otro sitio.

Por eso `disponibilidadEnRango` acepta una caché: con ella no consulta nada y
se puede ejecutar en una prueba. Y por eso la aritmética de los huecos se sacó
a `src/huecos.js` — cargar la librería de Google entera para comprobar una
resta de minutos no tiene sentido, y además pesa en el arranque.

**Si escribes lógica de decisión con una consulta dentro, deja de ser
probable.** Es la frontera donde se ha roto todo lo que se ha roto en este
proyecto.

## Cómo comprobar que una prueba sirve

Una prueba que nunca ha fallado no ha demostrado nada. Después de escribirla,
**rompe el código a propósito** y comprueba que se pone en rojo. Si sigue en
verde, la prueba no vale.

Ejemplo real, con el bug de los turnos del 6 de agosto:

```
# En equipo.js, cambiar el `return false` de «hoy libra» por `return true`
npm test
# → not ok 2 - con turno solo los martes, el sábado LIBRA
```

## Lo que NO cubren

- El flujo de conversación completo de WhatsApp (estados, botones, router).
- El multi-tienda con dos números a la vez.
- Google Calendar y la reconciliación.
- El panel como interfaz (solo se comprueban los tipos y la aritmética).

Nada de eso está probado automáticamente. Se prueba a mano, y por eso los
puntos 1 y 2 de `docs/05-next-steps.md` siguen siendo imprescindibles.
