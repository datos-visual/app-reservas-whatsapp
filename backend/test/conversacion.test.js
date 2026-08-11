// LAS DECISIONES DE LA CONVERSACIÓN.
//
// Cada bloque de este fichero corresponde a un fallo que llegó a producción y
// que descubrió José Manuel usando el sistema, no una prueba. Ahora los
// descubre `npm test` en dos segundos.
//
// El equilibrio que se prueba aquí es delicado: si el detector de «anúlala» es
// demasiado estrecho, la clienta pide anular y el bot no se entera (molesto,
// pero lo recoge la IA). Si es demasiado ancho, **se cancela una cita real a
// quien solo estaba rechazando un hueco** (caro, y no hay vuelta atrás).
// Ante la duda, no cancelar.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  quiereAnular,
  esComandoCancelar,
  argumentoDeCancelar,
  idDePayload,
  partesDeProfesional
} = require('../src/conversacion');

describe('pedir anular con sus propias palabras', () => {
  // BUG 5-ago-2026: la clienta escribió esto y el bot no lo entendió.
  for (const frase of [
    'anúlala',
    'anulala',
    'No me viene bien, anúlala',
    'cancélamela por favor',
    'bórrala',
    'quítala',
    'elimínala',
    'no puedo ir el viernes',
    'al final no podré ir',
    'no voy a poder ir'
  ]) {
    test(`«${frase}» → sí quiere anular`, () => assert.equal(quiereAnular(frase), true));
  }

  test('el comando de siempre sigue funcionando', () => {
    assert.equal(quiereAnular('cancelar'), true);
    assert.equal(quiereAnular('CANCELAR 3'), true);
  });
});

describe('lo que NO puede tomarse por una anulación', () => {
  // Éstas son las peligrosas. El prompt del NLU usa «déjalo» como ejemplo de
  // RECHAZAR una propuesta: si aquí dijéramos que sí, cancelaríamos la cita de
  // alguien que solo estaba diciendo que no a un hueco.
  for (const frase of [
    'déjalo',
    'dejalo',
    'olvídalo',
    'mejor no',
    'no me viene bien',
    'esa hora no',
    'no gracias',
    'hola',
    'quiero cita para mañana',
    '¿qué citas tengo?',
    ''
  ]) {
    test(`«${frase}» → NO se toca ninguna cita`, () => assert.equal(quiereAnular(frase), false));
  }
});

describe('el argumento de «cancelar 2»', () => {
  test('en el comando, se coge el número', () => {
    assert.equal(argumentoDeCancelar('cancelar 2'), '2');
    assert.equal(argumentoDeCancelar('CANCELAR 15'), '15');
  });

  // EL BUG del 5-ago-2026, exacto: se cogía la segunda palabra de CUALQUIER
  // frase. Aquí era «me», se buscaba una cita con ese id y la clienta recibía
  // «No encuentro esa cita» después de haber pedido claramente que la anularan.
  test('hablando normal NO se inventa un identificador', () => {
    assert.equal(argumentoDeCancelar('no me viene bien, anúlala'), null);
    assert.equal(argumentoDeCancelar('anúlala por favor'), null);
    assert.equal(argumentoDeCancelar('bórrala ya'), null);
  });

  test('«cancelar» a secas no tiene argumento', () => {
    assert.equal(argumentoDeCancelar('cancelar'), null);
  });

  test('esComandoCancelar distingue el comando de la frase', () => {
    assert.equal(esComandoCancelar('cancelar 2'), true);
    assert.equal(esComandoCancelar('anúlala'), false);
  });
});

describe('identificadores de botón', () => {
  test('se extrae el número del prefijo', () => {
    assert.equal(idDePayload('ca:res:svc:12', 'ca:res:svc:'), 12);
    assert.equal(idDePayload('ca:res:prof:0', 'ca:res:prof:'), 0);
  });

  test('otro prefijo devuelve null, no un número equivocado', () => {
    assert.equal(idDePayload('ca:res:day:2026-08-08', 'ca:res:svc:'), null);
  });

  // NaN es peor que null: se cuela en la consulta y el error aparece lejos.
  test('lo que no es número devuelve null, nunca NaN', () => {
    assert.equal(idDePayload('ca:res:svc:abc', 'ca:res:svc:'), null);
    assert.equal(idDePayload('ca:res:svc:', 'ca:res:svc:'), null);
    assert.equal(idDePayload(null, 'ca:res:svc:'), null);
  });
});

describe('botones de «tu profesional no puede»', () => {
  test('con persona concreta', () => {
    assert.deepEqual(partesDeProfesional('ca:prof:con:12:3'), { accion: 'con', citaId: 12, personaId: 3 });
  });

  test('sin persona', () => {
    assert.deepEqual(partesDeProfesional('ca:prof:anular:12'), { accion: 'anular', citaId: 12, personaId: null });
  });

  test('«me da igual quién»', () => {
    assert.equal(partesDeProfesional('ca:prof:cualquiera:7').accion, 'cualquiera');
  });

  test('un payload de otro flujo no se confunde', () => {
    assert.equal(partesDeProfesional('ca:res:prof:3'), null);
    assert.equal(partesDeProfesional('ca:apt:si'), null);
  });

  // Todo esto llega del CLIENTE. Aquí solo se interpreta la forma; que la cita
  // sea suya se comprueba después contra la base de datos.
  test('un identificador manipulado no produce NaN', () => {
    assert.equal(partesDeProfesional('ca:prof:con:xx:yy').citaId, null);
    assert.equal(partesDeProfesional('ca:prof:con:xx:yy').personaId, null);
  });
});
