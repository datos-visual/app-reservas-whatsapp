// EL FRENO DE LA IA — interruptor manual y tope diario por tienda.
//
// Las claves de los proveedores son UNAS para todas las tiendas. Sin freno,
// una peluquería puede dejar sin IA (o sin presupuesto) a las demás.
//
// La regla que más importa de este fichero es la última: **si el freno falla,
// deja pasar**. Es una protección de costes, no una regla de negocio. Que se
// caiga la tabla del contador no puede dejar mudo al asistente de nadie.
//
// Aquí se prueba la DECISIÓN. La consulta a Supabase se sustituye por datos
// en la mano, que es justo lo que permite ejecutarlo sin base de datos.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Réplica exacta de la decisión de nlu.sinIA(). Se mantiene aquí, aparte, para
// poder recorrer los casos sin red: si cambias la de nlu.js, cambia esta.
function decidir({ activo = true, tope = 400, usadas = null, contadorRoto = false }) {
  if (!activo) return { sinIa: true, contó: false };
  if (!Number.isInteger(tope) || tope <= 0) return { sinIa: false, contó: false };
  if (contadorRoto) return { sinIa: false, contó: false };
  return { sinIa: usadas > tope, contó: true };
}

describe('interruptor manual', () => {
  test('apagada a mano: no hay IA', () => {
    assert.equal(decidir({ activo: false }).sinIa, true);
  });

  // Si contase, el consumo de una tienda apagada crecería solo. Es el dato
  // con el que después decidimos si subirle el tope o cobrarle más.
  test('apagada a mano NO consume contador', () => {
    assert.equal(decidir({ activo: false }).contó, false);
  });

  test('encendida y dentro del tope: hay IA', () => {
    assert.equal(decidir({ activo: true, tope: 400, usadas: 12 }).sinIa, false);
  });
});

describe('tope diario', () => {
  test('la llamada que iguala el tope todavía pasa', () => {
    assert.equal(decidir({ tope: 400, usadas: 400 }).sinIa, false);
  });

  test('la siguiente ya no', () => {
    assert.equal(decidir({ tope: 400, usadas: 401 }).sinIa, true);
  });

  test('tope 0 = sin límite', () => {
    assert.equal(decidir({ tope: 0, usadas: 99999 }).sinIa, false);
  });

  test('sin tope válido tampoco se frena', () => {
    assert.equal(decidir({ tope: null, usadas: 99999 }).sinIa, false);
  });
});

describe('cuando el freno se rompe', () => {
  // Falta la migración, Supabase no responde, la función RPC no existe…
  test('el contador roto DEJA PASAR, nunca deja mudo al asistente', () => {
    assert.equal(decidir({ tope: 400, contadorRoto: true }).sinIa, false);
  });
});

describe('el orden de las comprobaciones', () => {
  // Apagada Y pasada de tope: manda el interruptor, y no se cuenta.
  test('el interruptor se mira antes que el contador', () => {
    const r = decidir({ activo: false, tope: 400, usadas: 9999 });
    assert.equal(r.sinIa, true);
    assert.equal(r.contó, false);
  });
});
