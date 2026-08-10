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

| Grupo | Estado |
|---|---|
| `/api/admin/*` (8 rutas) | ✅ en `routes/admin.js` |
| `/api/equipo`, `/api/aparatos`, `/api/services/:id/recursos` (15) | ✅ en `routes/equipo.js` |
| `/api/agenda`, `/api/appointments` | pendiente — usa `notificarListaEspera`, que vive en el flujo |
| `/api/business-hours`, `/api/closures` | pendiente — lleva `validarHorario` consigo |
| `/api/services`, `/api/verticals` | pendiente |
| `/api/onboarding/*`, `/api/store*`, `/api/whatsapp/status` | pendiente |
| `/api/missed-call/*`, `/api/messages` | pendiente |
| Flujo conversacional (≈2.500 líneas) | pendiente — **la parte delicada** |

`index.js` ha pasado de 3.832 a 3.471 líneas.

### El nudo que queda

`notificarListaEspera` la usan **el flujo de WhatsApp y las rutas de agenda**.
Antes de sacar la agenda hay que llevarla a su propio módulo (`avisos.js`),
no duplicarla. Es la única dependencia cruzada real que queda entre el panel
y la conversación.

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
