// LOS HUECOS QUE SE OFRECEN — y sobre todo los que NO.
//
// Este fichero existe por el bug del 6-ago-2026: un servicio de 2 h 30 en un
// sábado de 10:00 a 14:00 ofrecía UN solo hueco (las 10:00) en vez de cuatro.
// El cursor avanzaba el tamaño del servicio en lugar de la rejilla.
//
// Nadie lo denunció. Un fallo que solo OFRECE DE MENOS es el más caro que
// existe: la peluquería pierde tres horas vendibles cada sábado y lo achaca
// a que «no había hueco».
//
// Todas las fechas son de 2030 a propósito: generateSlots descarta los huecos
// ya pasados, así que una fecha futura hace la prueba independiente del día
// en que se ejecute.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generateSlots, seleccionarHuecos } = require('../src/huecos');

const ZONA = 'Europe/Madrid';
const SABADO = '2030-06-08';

function horas(opciones, eventos = []) {
  return generateSlots(SABADO, eventos, { zone: ZONA, ...opciones }).map((s) => s.label);
}

const evento = (desde, hasta) => ({
  start: { dateTime: `${SABADO}T${desde}:00+02:00` },
  end: { dateTime: `${SABADO}T${hasta}:00+02:00` }
});

describe('rejilla de inicio', () => {
  // EL BUG: con bloques del tamaño del servicio solo cabía uno.
  test('mechas de 2 h 30 con rejilla de 30 min → cuatro huecos', () => {
    assert.deepEqual(
      horas({ openTime: '10:00', closeTime: '14:00', slotDurationMinutes: 150, stepMinutes: 30 }),
      ['10:00', '10:30', '11:00', '11:30']
    );
  });

  test('el comportamiento antiguo (bloques) sigue disponible con stepMinutes 0', () => {
    assert.deepEqual(
      horas({ openTime: '10:00', closeTime: '14:00', slotDurationMinutes: 150, stepMinutes: 0 }),
      ['10:00']
    );
  });

  test('la última hora posible es el cierre MENOS la duración', () => {
    const r = horas({ openTime: '10:00', closeTime: '14:00', slotDurationMinutes: 150, stepMinutes: 30 });
    assert.equal(r.at(-1), '11:30');
  });

  test('rejilla de 15 min duplica las opciones', () => {
    const r = horas({ openTime: '10:00', closeTime: '12:00', slotDurationMinutes: 60, stepMinutes: 15 });
    assert.deepEqual(r, ['10:00', '10:15', '10:30', '10:45', '11:00']);
  });
});

describe('capacidad y eventos del calendario', () => {
  test('con capacidad 1, un evento tapa el hueco', () => {
    const r = horas(
      { openTime: '10:00', closeTime: '12:00', slotDurationMinutes: 60, stepMinutes: 60, capacity: 1 },
      [evento('10:00', '11:00')]
    );
    assert.deepEqual(r, ['11:00']);
  });

  // BUG 3-ago-2026: sin pasar la capacidad, el primer evento descartaba el
  // hueco y el filtro por equipo no llegaba ni a verlo.
  test('con capacidad 2, un solo evento NO tapa el hueco', () => {
    const r = horas(
      { openTime: '10:00', closeTime: '12:00', slotDurationMinutes: 60, stepMinutes: 60, capacity: 2 },
      [evento('10:00', '11:00')]
    );
    assert.deepEqual(r, ['10:00', '11:00']);
  });

  test('con capacidad 2, dos eventos solapados sí lo tapan', () => {
    const r = horas(
      { openTime: '10:00', closeTime: '12:00', slotDurationMinutes: 60, stepMinutes: 60, capacity: 2 },
      [evento('10:00', '11:00'), evento('10:30', '11:30')]
    );
    assert.deepEqual(r, ['11:00']);
  });
});

describe('selección de huecos (P1 premium)', () => {
  const slots = [
    { label: '10:00', adyacencia: 0 },
    { label: '11:00', adyacencia: 2 },
    { label: '12:00', adyacencia: 0 },
    { label: '13:00', adyacencia: 1 }
  ];

  test('sin smart_slots, los tres primeros por orden', () => {
    assert.deepEqual(seleccionarHuecos(slots, 3, false).map((s) => s.label), ['10:00', '11:00', '12:00']);
  });

  test('con smart_slots, prioriza los pegados a otra cita', () => {
    assert.deepEqual(seleccionarHuecos(slots, 2, true).map((s) => s.label), ['11:00', '13:00']);
  });

  // La clienta lee una lista de horas: si van desordenadas, parece un error.
  test('pero los devuelve SIEMPRE en orden cronológico', () => {
    const r = seleccionarHuecos(slots, 3, true).map((s) => s.label);
    assert.deepEqual(r, [...r].sort());
  });
});
