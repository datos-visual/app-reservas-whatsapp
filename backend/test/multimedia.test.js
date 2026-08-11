// NOTAS DE VOZ, FOTOS Y DEMÁS.
//
// Hasta el 10-ago-2026, un audio de WhatsApp se descartaba en el parseo y la
// clienta no recibía NADA. Ni una respuesta, ni un registro. El peor tipo de
// fallo de este proyecto: silencioso por los dos lados.
//
// En España la nota de voz es el modo por defecto de mucha gente, y justo del
// perfil que pide cita en una peluquería.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { extractIncomingMessages } = require('../src/whatsappCloud');

function webhook(mensaje) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '123456' },
          contacts: [{ wa_id: '34600111222', profile: { name: 'Marta' } }],
          messages: [{ from: '34600111222', id: 'wamid.TEST', ...mensaje }]
        }
      }]
    }]
  };
}

describe('lo que ya funcionaba sigue igual', () => {
  test('un texto normal', () => {
    const [m] = extractIncomingMessages(webhook({ type: 'text', text: { body: 'hola' } }));
    assert.equal(m.kind, 'text');
    assert.equal(m.body, 'hola');
    assert.equal(m.tipoMedia, null);
  });

  test('un botón interactivo', () => {
    const [m] = extractIncomingMessages(webhook({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'ca:apt:si', title: 'Confirmar' } }
    }));
    assert.equal(m.kind, 'button');
    assert.equal(m.payload, 'ca:apt:si');
  });

  test('el nombre del perfil sigue llegando', () => {
    const [m] = extractIncomingMessages(webhook({ type: 'text', text: { body: 'hola' } }));
    assert.equal(m.profileName, 'Marta');
  });
});

describe('la nota de voz ya no se pierde', () => {
  // EL FALLO: esto devolvía [] y la clienta se quedaba hablando sola.
  test('un audio llega al flujo en vez de descartarse', () => {
    const msgs = extractIncomingMessages(webhook({ type: 'audio', audio: { id: 'MEDIA123', voice: true } }));
    assert.equal(msgs.length, 1, 'el audio se ha vuelto a perder');
    assert.equal(msgs[0].kind, 'multimedia');
    assert.equal(msgs[0].tipoMedia, 'audio');
  });

  for (const tipo of ['image', 'video', 'document', 'sticker', 'location', 'contacts']) {
    test(`un mensaje de tipo «${tipo}» tampoco se pierde`, () => {
      const msgs = extractIncomingMessages(webhook({ type: tipo }));
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].kind, 'multimedia');
      assert.equal(msgs[0].tipoMedia, tipo);
    });
  }

  // Se distingue el audio del resto porque la respuesta no es la misma:
  // «no puedo escuchar audios» frente a «solo entiendo texto».
  test('el flujo puede distinguir un audio de una foto', () => {
    const [audio] = extractIncomingMessages(webhook({ type: 'audio' }));
    const [foto] = extractIncomingMessages(webhook({ type: 'image' }));
    assert.notEqual(audio.tipoMedia, foto.tipoMedia);
  });
});

describe('lo que sí debe seguir descartándose', () => {
  // Los avisos de entrega y lectura no son mensajes de nadie: si se colaran,
  // el bot se contestaría a sí mismo.
  test('un webhook sin mensajes no produce nada', () => {
    assert.deepEqual(extractIncomingMessages({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { metadata: { phone_number_id: '1' }, statuses: [{ status: 'delivered' }] } }] }]
    }), []);
  });

  test('un payload de otra cosa no produce nada', () => {
    assert.deepEqual(extractIncomingMessages({ object: 'page' }), []);
    assert.deepEqual(extractIncomingMessages(null), []);
  });

  test('un mensaje sin remitente se ignora', () => {
    const msgs = extractIncomingMessages({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { metadata: { phone_number_id: '1' }, messages: [{ type: 'audio', id: 'x' }] } }] }]
    });
    assert.deepEqual(msgs, []);
  });
});
