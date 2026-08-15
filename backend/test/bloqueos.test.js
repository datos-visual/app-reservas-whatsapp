// BLOQUEOS DE HORAS — «el jueves de 12 a 14 no cojas nada».
//
// Antes solo se podían bloquear días enteros. Para un rato había que crear el
// evento en Google Calendar, y con equipo eso NO funciona: un evento ocupa UNA
// plaza, así que con tres peluqueras el hueco se seguía ofreciendo dos veces.
//
// Lo que se prueba aquí es la regla pura, sin base de datos:
//   · sin resource_id → afecta a TODA la tienda
//   · con resource_id → solo a esa persona
// y sobre todo los BORDES, que es donde se cuelan las citas: un bloqueo de
// 12:00 a 14:00 no puede comerse el hueco que termina justo a las 12:00.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { bloqueado } = require('../src/equipo');

const bloqueoTienda = [{ resource_id: null, start_at: '2026-08-20T10:00:00.000Z', end_at: '2026-08-20T12:00:00.000Z' }];
const bloqueoDeMarta = [{ resource_id: 7, start_at: '2026-08-20T10:00:00.000Z', end_at: '2026-08-20T12:00:00.000Z' }];

describe('bloqueo de toda la tienda', () => {
  test('un hueco dentro queda bloqueado', () => {
    assert.equal(bloqueado(bloqueoTienda, '2026-08-20T10:30:00.000Z', '2026-08-20T11:00:00.000Z'), true);
  });

  test('bloquea a cualquiera, se pregunte por quien se pregunte', () => {
    assert.equal(bloqueado(bloqueoTienda, '2026-08-20T10:30:00.000Z', '2026-08-20T11:00:00.000Z', 7), true);
    assert.equal(bloqueado(bloqueoTienda, '2026-08-20T10:30:00.000Z', '2026-08-20T11:00:00.000Z', 99), true);
  });

  test('un hueco que lo pisa a medias también cuenta', () => {
    assert.equal(bloqueado(bloqueoTienda, '2026-08-20T09:30:00.000Z', '2026-08-20T10:30:00.000Z'), true);
    assert.equal(bloqueado(bloqueoTienda, '2026-08-20T11:30:00.000Z', '2026-08-20T12:30:00.000Z'), true);
  });
});

describe('los bordes — aquí es donde se pierden horas de trabajo', () => {
  // Si esto fallara, un bloqueo de 12 a 14 se comería también el hueco de
  // 11:30 y el de 14:00: dos citas perdidas cada vez, todos los días.
  test('el hueco que termina JUSTO cuando empieza el bloqueo, libre', () => {
    assert.equal(bloqueado(bloqueoTienda, '2026-08-20T09:30:00.000Z', '2026-08-20T10:00:00.000Z'), false);
  });

  test('el hueco que empieza JUSTO cuando termina el bloqueo, libre', () => {
    assert.equal(bloqueado(bloqueoTienda, '2026-08-20T12:00:00.000Z', '2026-08-20T12:30:00.000Z'), false);
  });

  test('otro día no se toca', () => {
    assert.equal(bloqueado(bloqueoTienda, '2026-08-21T10:30:00.000Z', '2026-08-21T11:00:00.000Z'), false);
  });
});

describe('bloqueo de UNA persona', () => {
  test('a ella sí', () => {
    assert.equal(bloqueado(bloqueoDeMarta, '2026-08-20T10:30:00.000Z', '2026-08-20T11:00:00.000Z', 7), true);
  });

  // Lo importante: el resto del equipo sigue trabajando. Si esto fallara, el
  // médico de Marta cerraría la peluquería entera.
  test('a las demás NO', () => {
    assert.equal(bloqueado(bloqueoDeMarta, '2026-08-20T10:30:00.000Z', '2026-08-20T11:00:00.000Z', 3), false);
  });

  // Sin persona se pregunta por la tienda: un bloqueo personal no la cierra
  test('no cierra la tienda', () => {
    assert.equal(bloqueado(bloqueoDeMarta, '2026-08-20T10:30:00.000Z', '2026-08-20T11:00:00.000Z', null), false);
  });
});

describe('tolerancia', () => {
  // Sin la migración aplicada, listarBloqueos devuelve []. Nada debe cambiar.
  test('sin bloqueos, nada se bloquea', () => {
    assert.equal(bloqueado([], '2026-08-20T10:30:00.000Z', '2026-08-20T11:00:00.000Z'), false);
    assert.equal(bloqueado(null, '2026-08-20T10:30:00.000Z', '2026-08-20T11:00:00.000Z'), false);
    assert.equal(bloqueado(undefined, '2026-08-20T10:30:00.000Z', '2026-08-20T11:00:00.000Z'), false);
  });
});
