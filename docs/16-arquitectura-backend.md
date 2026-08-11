# Arquitectura del backend

Última revisión: 10 de agosto de 2026.

---

## La costura principal: motor contra conversación

El backend se corta por una línea, y no es «rutas contra lógica»:

> **El MOTOR no sabe de peluquerías. La CONVERSACIÓN sí.**

Esa es la costura que permite añadir verticales (taller, restaurante…) sin
tocar la parte delicada. Ver `docs/15-verticales-encaje.md`.

### El motor (genérico, sin vocabulario de sector)

| Fichero | Qué decide |
|---|---|
| `huecos.js` | Qué horas se pueden ofrecer un día. **Pura**: sin red, sin BD |
| `equipo.js` | Quién puede atender: turnos, ausencias, aparatos, fases, habilidades |
| `agenda.js` | Citas del día, apuntar a mano, bloqueos |
| `sincronizacion.js` | Reconciliar con Google Calendar |
| `profesional.js` | Citas que se quedan sin profesional |
| `catalog.js` · `verticals.js` | Servicios y semillas por sector |

### La conversación (aquí sí hay vocabulario)

`index.js` — el flujo de WhatsApp: estados, botones, textos.

### Los servicios de infraestructura

`db.js` (Supabase), `calendar.js` (Google), `whatsappCloud.js` (Meta),
`nlu.js` (IA), `errores.js` (buzón), `auth.js`, `admin.js`.

---

## La frontera de autenticación

**Esto es lo más importante de este documento.** En `index.js` hay una línea:

```js
app.use('/api', authMiddleware);
```

En Express **el orden manda**. Todo lo registrado ANTES es público; lo de
después exige credenciales. Mover una ruta de un lado al otro:

- no da error,
- no rompe ninguna pantalla,
- no aparece en ningún log,
- y deja los datos de las clientas al alcance de cualquiera con la URL.

Por eso existe `backend/test/rutas.test.js`, que lee la tabla de rutas real de
Express —incluido lo que hay dentro de los Router— y comprueba que las rutas
públicas son **exactamente seis**:

| Ruta | Por qué puede responder sin sesión |
|---|---|
| `GET /` · `GET /health` | Sondas de vida |
| `GET /webhook` | Verificación de Meta |
| `POST /webhook` | Mensajes de Meta — protegido por **firma** |
| `POST /webhook/voice/twilio` | Llamadas de Twilio — protegido por **firma** |
| `POST /internal/missed-calls/dispatch` | El cron — protegido por `INTERNAL_CRON_TOKEN` |

Las tres últimas no están «abiertas»: se validan de otra forma, porque quien
llama es una máquina ajena que no puede tener sesión.

---

## Cómo sacar un grupo de rutas de index.js

Receta probada el 10-ago-2026 con `/api/admin` y `/api/equipo`. **Seguir los
pasos en este orden.**

**1. Localizar el bloque completo**, incluidas las funciones auxiliares que
solo usan esas rutas (`requireAdmin` se fue con el bloque de admin).

**2. Crear `src/routes/<nombre>.js`** con esta forma:

```js
const express = require('express');
// …los require que necesite el bloque…
const router = express.Router();

router.get('/api/loquesea', async (req, res) => { … });

module.exports = router;
```

**Las rutas llevan su camino completo** (`/api/equipo/:id`), no un prefijo de
montaje. Es a propósito: el fichero se mueve sin recalcular ninguna ruta, y
buscar `/api/equipo/:id` en el proyecto sigue encontrándolo a la primera.

**3. Montarlo en index.js POR DETRÁS del middleware:**

```js
app.use(require('./routes/equipo'));
```

**4. Verificar, en este orden:**

```
npm test          # eslint (no-undef) + 80 pruebas, incluidas las de rutas
```

Y comprobar el recuento de rutas: tiene que salir **el mismo número de antes**.
Si baja, se ha perdido un endpoint por el camino.

### Por qué el orden importa

`eslint` va primero porque el error más probable al mover código es **dejarse
una referencia atrás**: `node --check` no lo ve (la sintaxis es correcta) y las
pruebas tampoco, porque solo revienta cuando alguien llama a esa ruta. En la
extracción de `/api/equipo` faltó `getStoreConfig` y el detector lo cantó en
dos segundos.

---

## Estado de la partición

**Las 52 rutas del panel están fuera de `index.js`.** No queda ninguna.

| Fichero | Qué contiene |
|---|---|
| `routes/admin.js` | `/api/admin/*` — backoffice, solo ADMIN_TOKEN |
| `routes/equipo.js` | `/api/equipo`, `/api/aparatos`, requisitos de servicio |
| `routes/agenda.js` | `/api/agenda`, `/api/appointments`, horarios y cierres |
| `routes/tienda.js` | catálogo, plan, onboarding, WhatsApp, llamadas perdidas |
| `avisos.js` | Avisos del sistema (lista de espera) — **lo comparten panel y flujo** |

`index.js` ha pasado de **3.832 a 2.817 líneas** (−26%), y lo que queda es lo
que le corresponde: el flujo de conversación, los webhooks, el cron y el
arranque. Cero rutas del panel.

Verificado en cada paso: **58 rutas antes y después**, con las mismas 6
públicas.

### El flujo conversacional: cómo se está desmontando

Las ≈2.400 líneas del flujo hablan con Meta, con la base de datos y con el
calendario. **No se pueden ejecutar en una prueba** sin montar medio mundo
falso alrededor, y por eso no se parten «a lo bruto».

La estrategia es otra: **sacar las DECISIONES y dejar la fontanería**.

- `vocabulario.js` — las ocho frases que dependen del sector.
- `conversacion.js` — interpretar el identificador de un botón, decidir si una
  frase pide anular, sacar el argumento de un comando. **Las tres habían
  causado un fallo real en producción.**

Ambos son puros: reciben un texto y devuelven una respuesta. Se prueban sin
red ni base de datos.

**Regla:** si añades una decisión al flujo y se puede escribir sin `await`, va
a `conversacion.js` y con su prueba. Lo que necesite red o base de datos, se
queda en `index.js`.

Así el flujo adelgaza por donde importa —lo que puede razonar mal— y no por
donde no —lo que solo envía mensajes—. Partirlo entero en módulos sin esa red
sería repetir el error que se evitó con las rutas.

### El nudo que se deshizo

`notificarListaEspera` la usaban **a la vez** el flujo de WhatsApp y las rutas
de agenda. Era la única dependencia cruzada entre panel y conversación, y
mientras existiera no se podía separar ninguna de las dos sin duplicar código.
Vive en `avisos.js` y la importan las dos. **Duplicarla habría sido peor que
no separar.**

---

## Reglas para lo que venga

1. **La decisión se separa de la fontanería.** Lo que decide recibe datos por
   parámetro; lo que habla con el mundo va en otro fichero. Todo lo que se ha
   roto en este proyecto estaba en esa frontera.
2. **Ninguna ruta nueva por delante del middleware** salvo que sea una máquina
   ajena con su propia validación — y entonces se apunta en `rutas.test.js`
   explicando por qué.
3. **Cuando dudes entre fallar callado o fallar ruidoso, elige ruidoso.**
   Todo error que revienta va al buzón (`errores.js`) y se ve en `/admin`.
4. **Nada de vocabulario de sector en el motor.** Si hace falta decir
   «peluquera» o «mecánico», eso es de la capa de conversación.
