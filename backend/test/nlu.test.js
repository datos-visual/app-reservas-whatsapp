// LA IA SOLO INTERPRETA, NUNCA DECIDE.
//
// Esa frase es la regla más importante del proyecto y `validateNluResult` es
// donde se hace cumplir: todo lo que devuelve un modelo pasa por aquí antes
// de tocar nada. Un modelo puede alucinar una fecha, inventarse una intención
// o devolver basura; lo que no puede es colarla.
//
// Aquí NO se llama a ningún proveedor: se prueba el filtro, que es la parte
// que protege. Las pruebas no necesitan red ni claves.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { validateNluResult, buildPrompt } = require('../src/nlu');

const AHORA = DateTime.fromISO('2026-08-06T12:00:00', { zone: 'Europe/Madrid' });

describe('lo que el modelo NO puede colar', () => {
  test('una intención inventada se descarta entera', () => {
    assert.equal(validateNluResult({ intent: 'BORRAR_TODO', date: '2026-08-08' }), null);
  });

  test('una respuesta que no es un objeto se descarta', () => {
    assert.equal(validateNluResult('mañana a las 10'), null);
    assert.equal(validateNluResult(null), null);
  });

  test('una fecha con formato raro se anula, no se adivina', () => {
    const r = validateNluResult({ intent: 'DISPONIBLE', date: '8 de agosto' });
    assert.equal(r?.intent, 'OTRO');   // sin fecha válida, DISPONIBLE no vale
  });

  test('una hora imposible (25:99) se anula', () => {
    const r = validateNluResult({ intent: 'CITA', date: '2026-08-08', time: '25:99' });
    assert.equal(r.time, null);
  });

  test('una franja inventada se anula', () => {
    const r = validateNluResult({ intent: 'DISPONIBLE', date: '2026-08-08', franja: 'madrugada' });
    assert.equal(r.franja, null);
  });
});

describe('coherencia de la intención', () => {
  test('«quiero cita el viernes» sin hora → enseñar huecos de ese día', () => {
    const r = validateNluResult({ intent: 'CITA', date: '2026-08-08' });
    assert.equal(r.intent, 'DISPONIBLE');
    assert.equal(r.date, '2026-08-08');
  });

  test('«a las 10» sin día → intención a medias, el flujo preguntará', () => {
    const r = validateNluResult({ intent: 'CITA', time: '10:00' });
    assert.equal(r.intent, 'CITA_SIN_FECHA');
    assert.equal(r.time, '10:00');
  });

  test('«quiero cita» a secas no reserva nada', () => {
    assert.equal(validateNluResult({ intent: 'CITA' }).intent, 'OTRO');
  });

  test('una cita completa sí pasa', () => {
    const r = validateNluResult({ intent: 'CITA', date: '2026-08-08', time: '10:30' });
    assert.equal(r.intent, 'CITA');
    assert.equal(r.time, '10:30');
  });
});

describe('el contexto de la conversación llega al prompt', () => {
  // BUG jul-2026: interpretMessage recibía `conversation` y NO se lo pasaba a
  // buildPrompt. El modelo llevaba semanas interpretando cada mensaje a
  // ciegas, y por eso «anúlala» no tenía antecedente.
  test('los mensajes previos aparecen en el prompt', () => {
    const prompt = buildPrompt({
      text: 'anúlala',
      timezone: 'Europe/Madrid',
      nowDt: AHORA,
      conversation: [{ from_me: true, content: 'Tu cita del sábado a las 10:30 queda confirmada' }]
    });
    assert.match(prompt, /sábado a las 10:30/);
  });

  // Un mensaje sin texto (una imagen, un audio) metía la palabra literal
  // "undefined" en el prompt. Basura que el modelo se toma en serio.
  test('un mensaje sin texto no ensucia el prompt', () => {
    const prompt = buildPrompt({
      text: 'anúlala',
      timezone: 'Europe/Madrid',
      nowDt: AHORA,
      conversation: [{ from_me: false, content: null }, { from_me: true, content: 'Cita confirmada' }]
    });
    // Ojo: la plantilla del prompt contiene "null" a propósito (describe el
    // JSON de salida). Lo que no puede aparecer es una LÍNEA de conversación
    // vacía, que es lo que se colaba.
    assert.doesNotMatch(prompt, /^(Bot|Cliente): (undefined|null)$/m);
    assert.match(prompt, /Bot: Cita confirmada/);
  });

  test('sin conversación previa, el prompt se genera igual', () => {
    const prompt = buildPrompt({ text: 'hola', timezone: 'Europe/Madrid', nowDt: AHORA, conversation: [] });
    assert.equal(typeof prompt, 'string');
    assert.ok(prompt.length > 0);
  });
});
