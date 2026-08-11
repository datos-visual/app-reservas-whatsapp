// LA CACHÉ DE CONFIGURACIÓN.
//
// Una caché mal hecha es peor que ninguna: enseña datos de otra tienda, o hace
// que un cambio del panel «no funcione» durante quince segundos y vuelva loca
// a la dueña. Eso es lo que se prueba aquí.

require('./entorno');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { conCache, olvidarTienda, olvidarTodo, tamano } = require('../src/cacheTienda');

beforeEach(() => olvidarTodo());

describe('ahorra consultas', () => {
  test('pedir lo mismo cinco veces consulta UNA', async () => {
    let veces = 0;
    const leer = async () => { veces++; return 'valor'; };
    for (let i = 0; i < 5; i++) await conCache('t1', 'premium', leer);
    assert.equal(veces, 1);
  });

  // Es el caso real: al pintar una pantalla salen varias peticiones a la vez
  // pidiendo la misma configuración. Guardar la promesa las junta en una.
  test('cinco a la vez también consultan UNA', async () => {
    let veces = 0;
    const leer = async () => { veces++; await new Promise((r) => setTimeout(r, 10)); return 'v'; };
    await Promise.all([1, 2, 3, 4, 5].map(() => conCache('t1', 'premium', leer)));
    assert.equal(veces, 1);
  });
});

describe('nunca mezcla tiendas', () => {
  test('cada tienda tiene lo suyo', async () => {
    const a = await conCache('tienda-A', 'premium', async () => 'de A');
    const b = await conCache('tienda-B', 'premium', async () => 'de B');
    assert.equal(a, 'de A');
    assert.equal(b, 'de B');
    assert.equal(await conCache('tienda-A', 'premium', async () => 'no deberia leerse'), 'de A');
  });

  test('cada dato tiene lo suyo', async () => {
    await conCache('t1', 'premium', async () => 'premium');
    assert.equal(await conCache('t1', 'ajustes', async () => 'ajustes'), 'ajustes');
  });

  test('sin identificador de tienda, no se cachea nada', async () => {
    let veces = 0;
    const leer = async () => { veces++; return 'x'; };
    await conCache(null, 'premium', leer);
    await conCache(null, 'premium', leer);
    assert.equal(veces, 2);
    assert.equal(tamano(), 0);
  });
});

describe('un cambio se ve al momento', () => {
  // LO IMPORTANTE. Si esto falla, la dueña activa algo en el panel, no pasa
  // nada, y llama por teléfono convencida de que el sistema está roto.
  test('olvidarTienda hace que se vuelva a leer', async () => {
    let valor = 'antes';
    const leer = async () => valor;
    assert.equal(await conCache('t1', 'premium', leer), 'antes');
    valor = 'después';
    assert.equal(await conCache('t1', 'premium', leer), 'antes', 'todavía cacheado, correcto');
    olvidarTienda('t1');
    assert.equal(await conCache('t1', 'premium', leer), 'después');
  });

  test('olvidar una tienda no afecta a las demás', async () => {
    await conCache('t1', 'premium', async () => 'A');
    await conCache('t2', 'premium', async () => 'B');
    olvidarTienda('t1');
    assert.equal(await conCache('t2', 'premium', async () => 'releido'), 'B');
  });
});

describe('un fallo no se queda pegado', () => {
  // Si se cachea un error, la tienda se queda rota quince segundos por un
  // corte de red de un instante.
  test('tras un error, el siguiente intento vuelve a leer', async () => {
    let fallar = true;
    const leer = async () => {
      if (fallar) throw new Error('supabase caído');
      return 'ya va';
    };
    await assert.rejects(() => conCache('t1', 'premium', leer));
    fallar = false;
    assert.equal(await conCache('t1', 'premium', leer), 'ya va');
  });
});
