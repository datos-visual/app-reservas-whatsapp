// SALUD DEL SISTEMA — que lo roto se vea.
//
// Este proyecto tiene un sesgo conocido: cuando algo falla, se protege y se
// calla. El planificador murió semanas, un servicio se quedó sin nadie que lo
// hiciera, una migración sin ejecutar dejó un barrido entero sin funcionar.
// Ninguno dio error.
//
// Lo que se prueba aquí es que el semáforo NO se ponga en verde cuando hay
// algo roto. Un panel que miente es peor que no tener panel.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { componerSalud } = require('../src/admin');

const cronSano = { alerta: false, hace_minutos: 4 };
const sinNada = { tiendas: [], cron: cronSano, faltanMigraciones: [], huerfanos: [] };

const check = (salud, id) => salud.checks.find((c) => c.id === id);

describe('el semáforo general', () => {
  test('sin nada que reportar, verde', () => {
    assert.equal(componerSalud(sinNada).nivel, 'ok');
  });

  test('un solo aviso lo pone en ámbar', () => {
    const salud = componerSalud({
      ...sinNada,
      tiendas: [{ name: 'Peluquería A', incidencias: [{ tipo: 'token', nivel: 'aviso', texto: 'Caduca en 3 días' }] }]
    });
    assert.equal(salud.nivel, 'aviso');
  });

  test('un solo error lo pone en rojo, aunque todo lo demás esté bien', () => {
    const salud = componerSalud({
      ...sinNada,
      tiendas: [
        { name: 'A', incidencias: [{ tipo: 'token', nivel: 'aviso', texto: 'Caduca en 3 días' }] },
        { name: 'B', incidencias: [{ tipo: 'whatsapp', nivel: 'error', texto: 'WhatsApp sin conectar' }] }
      ]
    });
    assert.equal(salud.nivel, 'error');
  });
});

describe('el planificador', () => {
  test('al día, verde', () => {
    assert.equal(check(componerSalud(sinNada), 'planificador').nivel, 'ok');
  });

  test('parado, ROJO', () => {
    const salud = componerSalud({ ...sinNada, cron: { alerta: true, hace_minutos: 180 } });
    assert.equal(check(salud, 'planificador').nivel, 'error');
    assert.equal(salud.nivel, 'error');
  });

  // Sin constancia de ninguna pasada es indistinguible de «lleva días muerto».
  // Se trata como lo peor, no como lo mejor.
  test('sin constancia de ninguna pasada, ROJO', () => {
    const salud = componerSalud({ ...sinNada, cron: { alerta: true, sin_datos: true } });
    assert.equal(check(salud, 'planificador').nivel, 'error');
    assert.match(check(salud, 'planificador').detalle, /Sin constancia/);
  });
});

describe('migraciones sin aplicar', () => {
  test('todas puestas, verde', () => {
    assert.equal(check(componerSalud(sinNada), 'migraciones').nivel, 'ok');
  });

  test('alguna sin aplicar, ROJO y con el nombre del fichero', () => {
    const salud = componerSalud({
      ...sinNada,
      faltanMigraciones: [{ fichero: 'migration_tope_ia.sql', para: 'tope de IA' }]
    });
    const c = check(salud, 'migraciones');
    assert.equal(c.nivel, 'error');
    assert.match(c.detalle, /migration_tope_ia\.sql/);
  });
});

describe('agrupación por problema, no por tienda', () => {
  const salud = componerSalud({
    ...sinNada,
    tiendas: [
      { name: 'A', incidencias: [{ tipo: 'calendario', nivel: 'error', texto: 'Google Calendar sin conectar' }] },
      { name: 'B', incidencias: [{ tipo: 'calendario', nivel: 'error', texto: 'Google Calendar sin conectar' }] },
      { name: 'C', incidencias: [{ tipo: 'horarios', nivel: 'aviso', texto: 'Horario incompleto' }] }
    ]
  });

  test('el mismo problema en dos tiendas es UNA línea', () => {
    assert.equal(check(salud, 'calendario').tiendas.length, 2);
    assert.equal(salud.checks.filter((c) => c.id === 'calendario').length, 1);
  });

  test('pero se puede desplegar para ver cuáles son', () => {
    assert.deepEqual(check(salud, 'calendario').tiendas.map((t) => t.nombre), ['A', 'B']);
  });

  test('lo grave sale primero', () => {
    const orden = salud.checks.map((c) => c.nivel);
    assert.deepEqual(orden, [...orden].sort((a, b) => ({ ok: 0, aviso: 1, error: 2 }[b]) - ({ ok: 0, aviso: 1, error: 2 }[a])));
  });
});

describe('servicios que no puede hacer nadie (B5.5)', () => {
  test('se listan aparte y en rojo', () => {
    const salud = componerSalud({
      ...sinNada,
      huerfanos: [{ tienda: 'Peluquería A', texto: 'Tinte, Mechas' }]
    });
    const c = check(salud, 'servicios');
    assert.equal(c.nivel, 'error');
    assert.match(c.tiendas[0].texto, /Tinte/);
  });

  test('si no hay ninguno, ni siquiera aparece la línea', () => {
    assert.equal(check(componerSalud(sinNada), 'servicios'), undefined);
  });
});
