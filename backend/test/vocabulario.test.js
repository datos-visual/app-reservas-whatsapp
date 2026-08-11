// EL VOCABULARIO POR SECTOR.
//
// Lo que se prueba aquí no es la traducción, es la TOLERANCIA: que un vertical
// desconocido, o sin vertical, o con la consulta caída, no deje un mensaje a
// medias. Una frase rota la lee la clienta.
//
// Y que ningún sector se deje una frase sin traducir, que es como saldría un
// «Elegir profesional» en mitad de un taller mecánico.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { textosDe, TEXTOS } = require('../src/vocabulario');

const CLAVES = Object.keys(TEXTOS.defecto);

describe('todos los sectores están completos', () => {
  for (const [sector, frases] of Object.entries(TEXTOS)) {
    test(`«${sector}» tiene las ${CLAVES.length} frases`, () => {
      assert.deepEqual(Object.keys(frases).sort(), [...CLAVES].sort(),
        `A «${sector}» le falta o le sobra alguna frase respecto a «defecto»`);
    });

    test(`«${sector}» no deja ninguna frase vacía`, () => {
      for (const [clave, valor] of Object.entries(frases)) {
        assert.equal(typeof valor, 'string', `${sector}.${clave} no es texto`);
        assert.ok(valor.trim().length > 0, `${sector}.${clave} está vacía`);
      }
    });
  }
});

describe('los límites de WhatsApp', () => {
  // Meta corta los títulos de fila a 24 caracteres y los de botón a 20. Si se
  // pasa, no avisa: los recorta y queda una frase a medias en el móvil.
  test('los títulos de botón caben en 20 caracteres', () => {
    for (const [sector, f] of Object.entries(TEXTOS)) {
      assert.ok(f.elegirProfesional.length <= 20, `${sector}: «${f.elegirProfesional}» pasa de 20`);
      assert.ok(f.meDaIgual.length <= 20, `${sector}: «${f.meDaIgual}» pasa de 20`);
    }
  });

  test('las descripciones de fila caben en 72 caracteres', () => {
    for (const [sector, f] of Object.entries(TEXTOS)) {
      assert.ok(f.mismaHoraOtraPersona.length <= 72, `${sector}: descripción demasiado larga`);
      assert.ok(f.meDaIgualDetalle.length <= 72, `${sector}: descripción demasiado larga`);
    }
  });
});

describe('tolerancia: nunca se queda sin palabras', () => {
  test('un vertical que no conocemos usa el de siempre', () => {
    assert.deepEqual(textosDe('floristeria'), TEXTOS.defecto);
  });

  test('sin vertical, el de siempre', () => {
    assert.deepEqual(textosDe(null), TEXTOS.defecto);
    assert.deepEqual(textosDe(undefined), TEXTOS.defecto);
    assert.deepEqual(textosDe(''), TEXTOS.defecto);
  });

  test('el taller sí cambia las palabras', () => {
    assert.equal(textosDe('taller').elegirProfesional, 'Elegir mecánico');
    assert.notEqual(textosDe('taller').mismaHoraOtraPersona, TEXTOS.defecto.mismaHoraOtraPersona);
  });
});

describe('concordancia del castellano', () => {
  // El motivo de guardar frases enteras y no palabras sueltas: «la profesional»
  // pero «el mecánico». Si alguien vuelve a ensamblar género con código, esto
  // debería empezar a fallar.
  test('la peluquería habla en femenino y el taller en masculino', () => {
    assert.match(TEXTOS.defecto.mismaHoraOtraPersona, /otra/);
    assert.match(TEXTOS.taller.mismaHoraOtraPersona, /otro/);
  });
});
