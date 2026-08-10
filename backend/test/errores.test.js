// EL BUZÓN DE ERRORES.
//
// Dos cosas que no puede hacer nunca, y por eso están probadas:
//
//   1. Guardar datos de clientas. Un registro de errores es de las tablas que
//      más gente acaba mirando; si ahí hay teléfonos, los teléfonos se filtran.
//   2. Tumbar la petición que estaba vigilando. Un sistema de avisos que rompe
//      lo que vigila es peor que no tener avisos.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { limpiar } = require('../src/errores');
const { componerSalud } = require('../src/admin');

describe('nunca se guardan datos de clientas', () => {
  test('los teléfonos se tapan', () => {
    assert.equal(limpiar('Fallo enviando a 34600123456'), 'Fallo enviando a <telefono>');
  });

  test('los correos se tapan', () => {
    assert.equal(limpiar('No existe marta.lopez@gmail.com'), 'No existe <email>');
  });

  test('varios a la vez', () => {
    const r = limpiar('a 600111222 y a 600333444 de pepa@x.es');
    assert.doesNotMatch(r, /600111222|600333444|pepa@x\.es/);
  });

  test('un mensaje larguísimo se recorta', () => {
    assert.ok(limpiar('x'.repeat(5000)).length <= 300);
  });

  test('sin mensaje no revienta', () => {
    assert.equal(limpiar(null), '');
    assert.equal(limpiar(undefined), '');
  });
});

describe('los errores salen en el bloque de Salud', () => {
  const base = { tiendas: [{ id: 't1', name: 'Peluquería A', incidencias: [] }], cron: { alerta: false, hace_minutos: 2 }, faltanMigraciones: [], huerfanos: [] };

  test('sin errores, no aparece la línea', () => {
    const salud = componerSalud({ ...base, errores: [] });
    assert.equal(salud.checks.find((c) => c.id === 'errores'), undefined);
    assert.equal(salud.nivel, 'ok');
  });

  test('con un error, el semáforo entero se pone en rojo', () => {
    const salud = componerSalud({
      ...base,
      errores: [{ id: 1, store_id: 't1', ambito: 'webhook', mensaje: 'fmtHuman is not defined', veces: 3 }]
    });
    const c = salud.checks.find((x) => x.id === 'errores');
    assert.equal(c.nivel, 'error');
    assert.equal(salud.nivel, 'error');
  });

  test('se dice de qué tienda es y cuántas veces ha pasado', () => {
    const salud = componerSalud({
      ...base,
      errores: [{ id: 7, store_id: 't1', ambito: 'webhook', mensaje: 'algo falló', veces: 42 }]
    });
    const fila = salud.checks.find((x) => x.id === 'errores').tiendas[0];
    assert.equal(fila.nombre, 'Peluquería A');
    assert.match(fila.texto, /42 veces/);
    assert.equal(fila.id, 7, 'hace falta el id para poder marcarlo como visto');
  });

  test('un error sin tienda (del sistema) se identifica por su ámbito', () => {
    const salud = componerSalud({
      ...base,
      errores: [{ id: 9, store_id: null, ambito: 'cron', mensaje: 'timeout', veces: 1 }]
    });
    assert.equal(salud.checks.find((x) => x.id === 'errores').tiendas[0].nombre, '(cron)');
  });

  test('si ocurrió una sola vez, no se dice «1 veces»', () => {
    const salud = componerSalud({
      ...base,
      errores: [{ id: 3, store_id: 't1', ambito: 'api', mensaje: 'fallo puntual', veces: 1 }]
    });
    assert.doesNotMatch(salud.checks.find((x) => x.id === 'errores').tiendas[0].texto, /veces/);
  });

  // Lo más grave primero: un error real por encima de un token que caduca.
  test('los errores salen antes que los avisos', () => {
    const salud = componerSalud({
      ...base,
      tiendas: [{ id: 't1', name: 'A', incidencias: [{ tipo: 'token', nivel: 'aviso', texto: 'caduca' }] }],
      errores: [{ id: 1, store_id: 't1', ambito: 'api', mensaje: 'boom', veces: 1 }]
    });
    assert.equal(salud.checks[0].nivel, 'error');
  });
});
