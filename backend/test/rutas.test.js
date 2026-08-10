// LA FRONTERA DE AUTENTICACIÓN — qué puede pedir cualquiera sin identificarse.
//
// En Express el orden MANDA. En index.js hay una línea que parte el fichero
// en dos mundos:
//
//     app.use('/api', authMiddleware);
//
// Todo lo registrado ANTES es público. Todo lo de después exige token de
// administrador o sesión de tienda. Mover una ruta de un lado al otro no da
// error, no rompe ninguna pantalla y no aparece en ningún log: simplemente
// deja los datos de las clientas al alcance de cualquiera con la URL.
//
// Esta prueba lee la tabla de rutas REAL de Express —no el código fuente— y
// comprueba dos cosas:
//
//   1. Las rutas públicas son EXACTAMENTE estas seis. Ni una más.
//   2. Todo lo que cuelga de /api está por detrás del middleware.
//
// Es la red que hacía falta para poder trocear index.js sin jugársela. Si
// añades una ruta pública a propósito, esta prueba se pondrá roja y tendrás
// que apuntarla abajo: esa fricción es justo lo que se busca.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/index');

// Las ÚNICAS rutas que pueden responder sin credenciales, y por qué:
//
//   GET  /                          sonda de vida trivial
//   GET  /health                    sonda de vida (Render la llama)
//   GET  /webhook                   verificación del webhook de Meta
//   POST /webhook                   mensajes de Meta — protegido por FIRMA, no por token
//   POST /webhook/voice/twilio      llamadas de Twilio — protegido por FIRMA
//   POST /internal/missed-calls/... el cron — protegido por INTERNAL_CRON_TOKEN
//
// Las tres últimas NO son «abiertas»: se validan de otra forma, porque quien
// llama es una máquina ajena que no puede tener sesión.
const PUBLICAS = [
  'GET /',
  'GET /health',
  'GET /webhook',
  'POST /webhook',
  'POST /webhook/voice/twilio',
  'POST /internal/missed-calls/dispatch'
];

/**
 * Tabla de rutas tal y como la ve Express, en su orden real.
 *
 * ATENCIÓN: baja también dentro de los Router montados con `app.use(...)`.
 * Sin esa recursión, la red dejaría de ver las rutas EN CUANTO se sacaran de
 * index.js a un módulo — o sea, justo cuando más falta hace. Una prueba que
 * se queda ciega al hacer el cambio que vigila no vigila nada.
 */
function recorrer(stack, publicaPorDefecto, rutas) {
  for (const capa of stack) {
    if (capa.route) {
      for (const metodo of Object.keys(capa.route.methods)) {
        rutas.push({ firma: `${metodo.toUpperCase()} ${capa.route.path}`, publica: publicaPorDefecto });
      }
    } else if (capa.handle && Array.isArray(capa.handle.stack)) {
      recorrer(capa.handle.stack, publicaPorDefecto, rutas);
    }
  }
}

function inventario() {
  const stack = app._router.stack;
  const authIdx = stack.findIndex((l) => l.name === 'authMiddleware');
  const rutas = [];
  stack.forEach((capa, i) => {
    // Un Router montado ANTES del middleware es público entero, y viceversa
    recorrer([capa], i < authIdx, rutas);
  });
  return { authIdx, rutas };
}

describe('el middleware de autenticación está montado', () => {
  test('existe y no es la última capa', () => {
    const { authIdx, rutas } = inventario();
    assert.ok(authIdx > 0, 'No se encuentra authMiddleware en la pila de Express');
    assert.ok(rutas.length > 0, 'No se ha registrado ninguna ruta');
  });
});

describe('rutas públicas', () => {
  test('son EXACTAMENTE las seis previstas', () => {
    const { rutas } = inventario();
    const publicas = rutas.filter((r) => r.publica).map((r) => r.firma).sort();
    assert.deepEqual(
      publicas,
      [...PUBLICAS].sort(),
      'Ha cambiado el conjunto de rutas públicas. Si es a propósito, actualiza PUBLICAS ' +
      'y explica por qué esa ruta puede responder sin credenciales.'
    );
  });
});

describe('rutas del panel', () => {
  test('NINGUNA ruta /api queda por delante del middleware', () => {
    const { rutas } = inventario();
    const coladas = rutas.filter((r) => r.publica && r.firma.includes(' /api'));
    assert.deepEqual(
      coladas.map((r) => r.firma),
      [],
      'Estas rutas /api están registradas ANTES de app.use(\'/api\', authMiddleware) ' +
      'y responden sin token a cualquiera.'
    );
  });

  test('hay rutas protegidas de verdad (no se ha vaciado el panel sin querer)', () => {
    const { rutas } = inventario();
    const protegidas = rutas.filter((r) => !r.publica);
    assert.ok(protegidas.length >= 40, `Solo hay ${protegidas.length} rutas protegidas; se esperaban 40 o más`);
  });

  test('todo lo protegido cuelga de /api', () => {
    const { rutas } = inventario();
    const raras = rutas.filter((r) => !r.publica && !r.firma.includes(' /api'));
    assert.deepEqual(raras.map((r) => r.firma), [],
      'Hay rutas detrás del middleware que no empiezan por /api: el middleware NO las protege, ' +
      'porque está montado en la ruta /api. Están abiertas.');
  });
});
