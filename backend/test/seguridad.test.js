// SEGURIDAD — lo que no puede fallar nunca.
//
// Estas pruebas no comprueban que la aplicación funcione: comprueban que
// **no se pueda usar de forma indebida**. Un fallo aquí no molesta a nadie,
// se lleva los datos de las clientas de alguien.
//
// Salieron de la revisión del 10-ago-2026, que encontró dos agujeros reales.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { mismoSecreto, resolveStoreId } = require('../src/auth');
const { limpiar } = require('../src/errores');

describe('comparación de secretos en tiempo constante', () => {
  test('el token correcto pasa', () => {
    assert.equal(mismoSecreto('abc123', 'abc123'), true);
  });

  test('uno distinto no pasa', () => {
    assert.equal(mismoSecreto('abc123', 'abc124'), false);
  });

  test('longitudes distintas no revientan', () => {
    assert.equal(mismoSecreto('abc', 'abcdefghij'), false);
  });

  // Sin token, sin cabecera, con un objeto raro: nunca «true» por accidente.
  test('lo que no es texto nunca coincide', () => {
    assert.equal(mismoSecreto(null, 'abc'), false);
    assert.equal(mismoSecreto(undefined, undefined), false);
    assert.equal(mismoSecreto({}, {}), false);
    assert.equal(mismoSecreto('', ''), true);   // dos vacíos SÍ son iguales
  });
});

describe('aislamiento entre tiendas: el ?store_id= del navegador', () => {
  // EL NÚCLEO DEL MULTI-TIENDA. Un usuario de tienda no puede pedir los datos
  // de otra manipulando la URL: su store_id sale de la sesión, punto.
  test('un usuario de tienda SIEMPRE usa la suya, aunque pida otra', () => {
    const req = { storeId: 'tienda-A', userId: 'u1', query: { store_id: 'tienda-B' } };
    assert.equal(resolveStoreId(req), 'tienda-A');
  });

  test('un usuario sin tienda no hereda ninguna del query', () => {
    const req = { userId: 'u1', storeId: null, query: { store_id: 'tienda-B' } };
    assert.equal(resolveStoreId(req), null);
  });

  test('el admin SÍ puede elegir tienda (es su trabajo)', () => {
    const req = { isAdmin: true, query: { store_id: 'tienda-B' } };
    assert.equal(resolveStoreId(req), 'tienda-B');
  });

  test('sin sesión y sin ser admin, no hay tienda', () => {
    assert.equal(resolveStoreId({ query: { store_id: 'tienda-B' } }), null);
  });
});

describe('el registro de errores no filtra datos de clientas', () => {
  test('teléfonos y correos se tapan antes de guardarse', () => {
    const r = limpiar('Fallo al enviar a 34600111222 (marta@gmail.com)');
    assert.doesNotMatch(r, /34600111222|marta@gmail\.com/);
  });
});
