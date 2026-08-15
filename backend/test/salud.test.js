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

// ---------------------------------------------------------------------
// QUÉ VERSIÓN ESTÁ VIVA
// ---------------------------------------------------------------------
//
// 14-ago-2026: dos arreglos subidos a las 16:15, pruebas manuales a las 16:26,
// y el bot seguía comportándose como antes. Media hora buscando en el código
// un fallo que ya estaba corregido: Render aún no había desplegado.
//
// No hay forma de adivinar eso desde WhatsApp. Ahora se pregunta.
describe('/health dice qué commit está atendiendo', () => {
  const { app } = require('../src/index');

  const pedirSalud = () => new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${server.address().port}/health`);
        resolve({ status: r.status, body: await r.json() });
      } catch (e) { reject(e); } finally { server.close(); }
    });
  });

  test('responde con el commit y la hora de arranque', async () => {
    const { status, body } = await pedirSalud();
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(typeof body.commit, 'string');
    assert.ok(!Number.isNaN(Date.parse(body.arrancado)), 'la hora de arranque tiene que ser una fecha');
  });

  // Fuera de Render no hay variable: mejor «desconocido» que reventar la sonda
  test('sin la variable de Render no falla', async () => {
    const { body } = await pedirSalud();
    assert.equal(body.commit, process.env.RENDER_GIT_COMMIT ? body.commit : 'desconocido');
  });
});

// ---------------------------------------------------------------------
// ZONA HORARIA — el fallo que no falla
// ---------------------------------------------------------------------
//
// No da error, no aparece en ningún log y el sistema funciona de maravilla:
// simplemente cita a las 10:00 a quien va a aparecer a las 9:00. Una
// peluquería en Canarias con Europe/Madrid tendría TODAS las citas corridas
// una hora, para siempre, y lo descubriría por una clienta enfadada.
//
// Por eso es error y no aviso.
describe('zona horaria de la tienda', () => {
  const conZona = (timezone) => componerSalud({
    ...sinNada,
    tiendas: [{
      name: 'Peluquería Canaria',
      incidencias: !timezone
        ? [{ tipo: 'zona', nivel: 'error', texto: 'Sin zona horaria: se usa Europe/Madrid' }]
        : timezone === 'Europe/Madriz'
          ? [{ tipo: 'zona', nivel: 'error', texto: 'Zona horaria inválida («Europe/Madriz»)' }]
          : []
    }]
  });

  test('sin zona horaria → rojo, no ámbar', () => {
    assert.equal(check(conZona(null), 'zona').nivel, 'error');
  });

  test('con una errata en la zona → rojo', () => {
    assert.match(check(conZona('Europe/Madriz'), 'zona').texto || check(conZona('Europe/Madriz'), 'zona').tiendas[0].texto, /inválida/);
  });

  test('con zona válida ni aparece la línea', () => {
    assert.equal(check(conZona('Atlantic/Canary'), 'zona'), undefined);
  });

  test('la zona rompe el semáforo general', () => {
    assert.equal(conZona(null).nivel, 'error');
  });
});
